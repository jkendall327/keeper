import { useState, useCallback, useRef } from 'react';
import type { Message, LLMClient } from '@motioneffector/llm';
import { parseMCPResponse } from './mcp-parser.ts';
import { executeTool, type ToolResult } from './tools.ts';
import { buildSystemPrompt } from './system-prompt.ts';
import { normalizeAssistantReply } from './chat-formatting.ts';
import type { KeeperClient } from '../db/db-client.ts';
import type { NoteWithTags, Tag } from '../db/types.ts';

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'tool'; content: string; toolResult: ToolResult };

interface PendingConfirmation {
  toolResult: ToolResult;
  args: Record<string, unknown>;
}

interface UseChatLoopOptions {
  client: LLMClient;
  keeper: KeeperClient;
  onMutation: () => void;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

const MAX_TOOL_ITERATIONS = 10;

export function useChatLoop({ client, keeper, onMutation, initialMessages = [], onMessagesChange }: UseChatLoopOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const commitMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    onMessagesChange?.(nextMessages);
  }, [onMessagesChange]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prevMessages) => {
      const nextMessages = [...prevMessages, message];
      onMessagesChange?.(nextMessages);
      return nextMessages;
    });
  }, [onMessagesChange]);

  // out.text is mutated as tokens arrive, so callers can read partial text even if the stream aborts.
  const streamOnce = useCallback(async (llmMessages: Message[], signal: AbortSignal, out: { text: string }): Promise<void> => {
    let lastFlush = 0;
    const THROTTLE_MS = 50;
    for await (const token of client.stream(llmMessages, { signal })) {
      out.text += token;
      const now = performance.now();
      if (now - lastFlush >= THROTTLE_MS) {
        lastFlush = now;
        setStreaming(normalizeAssistantReply(out.text));
      }
    }
    setStreaming('');
  }, [client]);

  const buildLLMMessages = useCallback((chatMessages: ChatMessage[], recentNotes: NoteWithTags[], tags: Tag[]): Message[] => {
    const systemPrompt = buildSystemPrompt(recentNotes, tags);
    const llmMessages: Message[] = [{ role: 'system', content: systemPrompt }];
    for (const msg of chatMessages) {
      if (msg.role === 'user') {
        llmMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        llmMessages.push({ role: 'assistant', content: msg.content });
      } else {
        llmMessages.push({ role: 'user', content: `[Tool Result: ${msg.toolResult.name}]\n${msg.content}` });
      }
    }
    return llmMessages;
  }, []);

  const send = useCallback(async (userInput: string) => {
    if (loading) return;
    setLoading(true);

    const newUserMsg: ChatMessage = { role: 'user', content: userInput };
    const currentMessages = [...messages, newUserMsg];
    commitMessages(currentMessages);

    let iterMessages = currentMessages;
    let iterations = 0;
    // acc is mutated by streamOnce so partial text survives an AbortError throw
    const acc = { text: '' };

    try {
      // Fetch context for the system prompt once per send
      const [recentNotes, allTags] = await Promise.all([keeper.notes.list(), keeper.tags.list()]);

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const llmMessages = buildLLMMessages(iterMessages, recentNotes, allTags);
        const controller = new AbortController();
        abortRef.current = controller;

        // Stream the response token-by-token
        acc.text = '';
        await streamOnce(llmMessages, controller.signal, acc);
        const { toolCalls, text } = parseMCPResponse(acc.text);

        if (toolCalls.length === 0) {
          // No tool calls — stream the final response for display
          const content = normalizeAssistantReply(text);
          if (content !== '') {
            const assistantMsg: ChatMessage = { role: 'assistant', content };
            iterMessages = [...iterMessages, assistantMsg];
            commitMessages(iterMessages);
          }
          break;
        }

        // Add assistant message with tool call indication
        const content = normalizeAssistantReply(text);
        if (content !== '') {
          const assistantMsg: ChatMessage = { role: 'assistant', content };
          iterMessages = [...iterMessages, assistantMsg];
        }

        // Execute tool calls
        let needsConfirmStop = false;
        for (const call of toolCalls) {
          let result: ToolResult;
          try {
            result = await executeTool(keeper, call);
          } catch (toolErr: unknown) {
            const msg = toolErr instanceof Error ? toolErr.message : 'Tool execution failed';
            const errorToolMsg: ChatMessage = {
              role: 'tool',
              content: `Error: ${msg}`,
              toolResult: { name: call.name, result: `Error: ${msg}`, needsConfirmation: false },
            };
            iterMessages = [...iterMessages, errorToolMsg];
            continue;
          }

          if (result.needsConfirmation) {
            // Pause for user confirmation
            const toolMsg: ChatMessage = { role: 'tool', content: result.result, toolResult: result };
            iterMessages = [...iterMessages, toolMsg];
            commitMessages(iterMessages);
            setPendingConfirmation({ toolResult: result, args: call.args });
            setLoading(false);
            needsConfirmStop = true;
            break;
          }

          const toolMsg: ChatMessage = { role: 'tool', content: result.result, toolResult: result };
          iterMessages = [...iterMessages, toolMsg];
          onMutation();
        }
        if (needsConfirmStop) return;

        commitMessages(iterMessages);
      }

      // If we exhausted the iteration limit, inform the user
      if (iterations >= MAX_TOOL_ITERATIONS) {
        const limitMsg: ChatMessage = {
          role: 'assistant',
          content: "I've reached the maximum number of actions. Please try a simpler request.",
        };
        appendMessage(limitMsg);
      }
    } catch (err: unknown) {
      setStreaming('');
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Preserve any partially streamed text as an assistant message
        const content = normalizeAssistantReply(acc.text);
        if (content !== '') {
          const partialMsg: ChatMessage = { role: 'assistant', content };
          commitMessages([...iterMessages, partialMsg]);
        }
      } else {
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
        const assistantMsg: ChatMessage = { role: 'assistant', content: `Error: ${errorMsg}` };
        commitMessages([...iterMessages, assistantMsg]);
      }
      return;
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading, commitMessages, streamOnce, keeper, buildLLMMessages, onMutation, appendMessage]);

  const confirmDelete = useCallback(async (confirmed: boolean) => {
    if (pendingConfirmation === null) return;
    setPendingConfirmation(null);

    setLoading(true);
    try {
      let toolMsg: ChatMessage;

      if (!confirmed) {
        toolMsg = {
          role: 'tool',
          content: 'Delete cancelled by user.',
          toolResult: { name: pendingConfirmation.toolResult.name, result: 'Delete cancelled by user.', needsConfirmation: false },
        };
      } else {
        const result = await executeTool(keeper, {
          name: 'confirm_delete_note',
          args: pendingConfirmation.args,
        });
        toolMsg = { role: 'tool', content: result.result, toolResult: result };
        onMutation();
      }

      // Build the updated message list with the confirmation result
      const updatedMessages: ChatMessage[] = [...messages, toolMsg];
      commitMessages(updatedMessages);

      // Send the confirmation result back to the LLM for a follow-up response
      const [recentNotes, allTags] = await Promise.all([keeper.notes.list(), keeper.tags.list()]);
      const llmMessages = buildLLMMessages(updatedMessages, recentNotes, allTags);
      const controller = new AbortController();
      abortRef.current = controller;

      const acc = { text: '' };
      await streamOnce(llmMessages, controller.signal, acc);

      if (acc.text !== '') {
        const { text } = parseMCPResponse(acc.text);
        const content = normalizeAssistantReply(text);
        if (content !== '') {
          const assistantMsg: ChatMessage = { role: 'assistant', content };
          commitMessages([...updatedMessages, assistantMsg]);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStreaming('');
      } else {
        setStreaming('');
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
        const assistantMsg: ChatMessage = { role: 'assistant', content: `Error: ${errorMsg}` };
        appendMessage(assistantMsg);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [pendingConfirmation, keeper, onMutation, messages, commitMessages, streamOnce, buildLLMMessages, appendMessage]);

  const clear = useCallback(() => {
    setMessages([]);
    setPendingConfirmation(null);
    setStreaming('');
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const loadMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    setPendingConfirmation(null);
    setStreaming('');
    setLoading(false);
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    messages,
    loading,
    streaming,
    pendingConfirmation,
    send,
    confirmDelete,
    clear,
    loadMessages,
    cancel,
  };
}
