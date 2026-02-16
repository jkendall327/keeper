import { useState, useCallback, useRef } from 'react';
import type { Message, LLMClient } from '@motioneffector/llm';
import { parseMCPResponse } from './mcp-parser.ts';
import { executeTool, type ToolResult } from './tools.ts';
import { buildSystemPrompt } from './system-prompt.ts';
import type { KeeperDB, NoteWithTags, Tag } from '../db/types.ts';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolResult?: ToolResult;
}

interface PendingConfirmation {
  toolResult: ToolResult;
  args: Record<string, unknown>;
}

interface UseChatLoopOptions {
  client: LLMClient;
  db: KeeperDB;
  onMutation: () => void;
}

const MAX_TOOL_ITERATIONS = 10;

export function useChatLoop({ client, db, onMutation }: UseChatLoopOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildLLMMessages = useCallback((chatMessages: ChatMessage[], recentNotes: NoteWithTags[], tags: Tag[]): Message[] => {
    const systemPrompt = buildSystemPrompt(recentNotes, tags);
    const llmMessages: Message[] = [{ role: 'system', content: systemPrompt }];
    for (const msg of chatMessages) {
      if (msg.role === 'user') {
        llmMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        llmMessages.push({ role: 'assistant', content: msg.content });
      } else {
        // Tool results are fed back as user messages with tool context
        llmMessages.push({ role: 'user', content: `[Tool Result: ${msg.toolResult?.name ?? 'unknown'}]\n${msg.content}` });
      }
    }
    return llmMessages;
  }, []);

  const send = useCallback(async (userInput: string) => {
    if (loading) return;
    setLoading(true);

    const newUserMsg: ChatMessage = { role: 'user', content: userInput };
    const currentMessages = [...messages, newUserMsg];
    setMessages(currentMessages);

    let iterMessages = currentMessages;
    let iterations = 0;
    let accumulated = '';

    try {
      // Fetch context for the system prompt once per send
      const [recentNotes, allTags] = await Promise.all([db.getAllNotes(), db.getAllTags()]);

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const llmMessages = buildLLMMessages(iterMessages, recentNotes, allTags);
        const controller = new AbortController();
        abortRef.current = controller;

        // Stream the response token-by-token
        accumulated = '';
        let lastFlush = 0;
        const THROTTLE_MS = 50;
        for await (const token of client.stream(llmMessages, { signal: controller.signal })) {
          accumulated += token;
          const now = performance.now();
          if (now - lastFlush >= THROTTLE_MS) {
            lastFlush = now;
            setStreaming(accumulated);
          }
        }
        // Final flush
        setStreaming('');
        const { toolCalls, text } = parseMCPResponse(accumulated);

        if (toolCalls.length === 0) {
          // No tool calls — stream the final response for display
          if (text !== '') {
            const assistantMsg: ChatMessage = { role: 'assistant', content: text };
            iterMessages = [...iterMessages, assistantMsg];
            setMessages(iterMessages);
          }
          break;
        }

        // Add assistant message with tool call indication
        if (text !== '') {
          const assistantMsg: ChatMessage = { role: 'assistant', content: text };
          iterMessages = [...iterMessages, assistantMsg];
        }

        // Execute tool calls
        let needsConfirmStop = false;
        for (const call of toolCalls) {
          let result: ToolResult;
          try {
            result = await executeTool(db, call);
          } catch (toolErr: unknown) {
            const msg = toolErr instanceof Error ? toolErr.message : 'Tool execution failed';
            const errorToolMsg: ChatMessage = { role: 'tool', content: `Error: ${msg}` };
            iterMessages = [...iterMessages, errorToolMsg];
            continue;
          }

          if (result.needsConfirmation === true) {
            // Pause for user confirmation
            const toolMsg: ChatMessage = { role: 'tool', content: result.result, toolResult: result };
            iterMessages = [...iterMessages, toolMsg];
            setMessages(iterMessages);
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

        setMessages(iterMessages);
      }

      // If we exhausted the iteration limit, inform the user
      if (iterations >= MAX_TOOL_ITERATIONS) {
        const limitMsg: ChatMessage = {
          role: 'assistant',
          content: "I've reached the maximum number of actions. Please try a simpler request.",
        };
        setMessages((prev) => [...prev, limitMsg]);
      }
    } catch (err: unknown) {
      setStreaming('');
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Preserve any partially streamed text as an assistant message
        if (accumulated !== '') {
          const partialMsg: ChatMessage = { role: 'assistant', content: accumulated };
          setMessages([...iterMessages, partialMsg]);
        }
      } else {
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
        const assistantMsg: ChatMessage = { role: 'assistant', content: `Error: ${errorMsg}` };
        setMessages([...iterMessages, assistantMsg]);
      }
      return;
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading, client, db, buildLLMMessages, onMutation]);

  const confirmDelete = useCallback(async (confirmed: boolean) => {
    if (pendingConfirmation === null) return;
    setPendingConfirmation(null);

    setLoading(true);
    try {
      let toolMsg: ChatMessage;

      if (!confirmed) {
        toolMsg = { role: 'tool', content: 'Delete cancelled by user.' };
      } else {
        const result = await executeTool(db, {
          name: 'confirm_delete_note',
          args: pendingConfirmation.args,
        });
        toolMsg = { role: 'tool', content: result.result, toolResult: result };
        onMutation();
      }

      // Build the updated message list with the confirmation result
      const updatedMessages: ChatMessage[] = [...messages, toolMsg];
      setMessages(updatedMessages);

      // Send the confirmation result back to the LLM for a follow-up response
      const [recentNotes, allTags] = await Promise.all([db.getAllNotes(), db.getAllTags()]);
      const llmMessages = buildLLMMessages(updatedMessages, recentNotes, allTags);
      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = '';
      let lastFlush = 0;
      const THROTTLE_MS = 50;
      for await (const token of client.stream(llmMessages, { signal: controller.signal })) {
        accumulated += token;
        const now = performance.now();
        if (now - lastFlush >= THROTTLE_MS) {
          lastFlush = now;
          setStreaming(accumulated);
        }
      }
      setStreaming('');

      if (accumulated !== '') {
        const { text } = parseMCPResponse(accumulated);
        if (text !== '') {
          const assistantMsg: ChatMessage = { role: 'assistant', content: text };
          setMessages([...updatedMessages, assistantMsg]);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStreaming('');
      } else {
        setStreaming('');
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
        const errorChatMsg: ChatMessage = { role: 'tool', content: `Error: ${errorMsg}` };
        setMessages((prev) => [...prev, errorChatMsg]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [pendingConfirmation, db, onMutation, messages, client, buildLLMMessages]);

  const clear = useCallback(() => {
    setMessages([]);
    setPendingConfirmation(null);
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
    cancel,
  };
}
