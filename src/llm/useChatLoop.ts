import { useReducer, useCallback, useRef } from 'react';
import type { Message, LLMClient } from '@motioneffector/llm';
import { parseMCPResponse } from './mcp-parser.ts';
import {
  executeConfirmedDelete,
  executeTool,
  TOOL_METADATA,
  type ToolArgsByName,
  type ToolCall,
  type ToolResult,
} from './tools.ts';
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
  args: ToolArgsByName['delete_note'];
}

interface UseChatLoopOptions {
  client: LLMClient;
  keeper: KeeperClient;
  onMutation: () => void;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

const MAX_TOOL_ITERATIONS = 10;

type ChatLoopStatus = 'idle' | 'streaming' | 'awaitingConfirmation';

interface ChatLoopState {
  messages: ChatMessage[];
  status: ChatLoopStatus;
  streamingText: string;
  pendingConfirmation: PendingConfirmation | null;
}

type ChatLoopAction =
  | { type: 'replaceMessages'; messages: ChatMessage[] }
  | { type: 'commitMessages'; messages: ChatMessage[] }
  | { type: 'startRun'; messages: ChatMessage[] }
  | { type: 'setStreamingText'; text: string }
  | { type: 'pauseForConfirmation'; messages: ChatMessage[]; pendingConfirmation: PendingConfirmation }
  | { type: 'resolveConfirmation' }
  | { type: 'finishRun' };

function chatLoopReducer(state: ChatLoopState, action: ChatLoopAction): ChatLoopState {
  switch (action.type) {
    case 'replaceMessages':
      return {
        messages: action.messages,
        status: 'idle',
        streamingText: '',
        pendingConfirmation: null,
      };
    case 'commitMessages':
      return {
        ...state,
        messages: action.messages,
      };
    case 'startRun':
      return {
        messages: action.messages,
        status: 'streaming',
        streamingText: '',
        pendingConfirmation: null,
      };
    case 'setStreamingText':
      return {
        ...state,
        streamingText: action.text,
      };
    case 'pauseForConfirmation':
      return {
        messages: action.messages,
        status: 'awaitingConfirmation',
        streamingText: '',
        pendingConfirmation: action.pendingConfirmation,
      };
    case 'resolveConfirmation':
      return {
        ...state,
        status: 'streaming',
        streamingText: '',
        pendingConfirmation: null,
      };
    case 'finishRun':
      return {
        ...state,
        status: 'idle',
        streamingText: '',
      };
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function toolCallKey(call: ToolCall): string {
  return `${call.name}:${stableStringify(call.args)}`;
}

function uniqueToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return toolCalls.filter((call) => {
    const key = toolCallKey(call);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function confirmationArgsFor(call: ToolCall): ToolArgsByName['delete_note'] | null {
  return call.name === 'delete_note' ? call.args : null;
}

function buildLLMMessages(chatMessages: ChatMessage[], recentNotes: NoteWithTags[], tags: Tag[]): Message[] {
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
}

function appendAssistantIfNonEmpty(messages: ChatMessage[], text: string): ChatMessage[] {
  const content = normalizeAssistantReply(text);
  if (content === '') return messages;
  return [...messages, { role: 'assistant', content }];
}

function toolResultMessage(result: ToolResult): ChatMessage {
  return { role: 'tool', content: result.result, toolResult: result };
}

function toolErrorMessage(call: ToolCall, error: unknown): ChatMessage {
  const msg = error instanceof Error ? error.message : 'Tool execution failed';
  return {
    role: 'tool',
    content: `Error: ${msg}`,
    toolResult: { name: call.name, result: `Error: ${msg}`, needsConfirmation: false },
  };
}

export function useChatLoop({ client, keeper, onMutation, initialMessages = [], onMessagesChange }: UseChatLoopOptions) {
  const [state, dispatch] = useReducer(chatLoopReducer, {
    messages: initialMessages,
    status: 'idle',
    streamingText: '',
    pendingConfirmation: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const commitMessages = useCallback((nextMessages: ChatMessage[]) => {
    dispatch({ type: 'commitMessages', messages: nextMessages });
    onMessagesChange?.(nextMessages);
  }, [onMessagesChange]);

  // out.text is mutated as tokens arrive, so callers can read partial text even if the stream aborts.
  const streamOnce = useCallback(async (
    llmMessages: Message[],
    signal: AbortSignal,
    out: { text: string },
    runId: number,
  ): Promise<void> => {
    let lastFlush = 0;
    const THROTTLE_MS = 50;
    for await (const token of client.stream(llmMessages, { signal })) {
      out.text += token;
      const now = performance.now();
      if (runId === runIdRef.current && now - lastFlush >= THROTTLE_MS) {
        lastFlush = now;
        dispatch({ type: 'setStreamingText', text: normalizeAssistantReply(out.text) });
      }
    }
    if (runId === runIdRef.current) {
      dispatch({ type: 'setStreamingText', text: '' });
    }
  }, [client]);

  const completeFromMessages = useCallback(async (startingMessages: ChatMessage[]) => {
    if (state.status !== 'idle') return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    dispatch({ type: 'startRun', messages: startingMessages });
    onMessagesChange?.(startingMessages);

    let iterMessages = startingMessages;
    let iterations = 0;
    let exhausted = true;
    let pausedForConfirmation = false;
    // acc is mutated by streamOnce so partial text survives an AbortError throw
    const acc = { text: '' };

    try {
      // Fetch context for the system prompt once per send
      const [recentNotes, allTags] = await Promise.all([keeper.notes.list(), keeper.tags.list()]);
      if (runId !== runIdRef.current) return;

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const llmMessages = buildLLMMessages(iterMessages, recentNotes, allTags);
        const controller = new AbortController();
        abortRef.current = controller;

        // Stream the response token-by-token
        acc.text = '';
        await streamOnce(llmMessages, controller.signal, acc, runId);
        if (runId !== runIdRef.current) return;
        const { toolCalls: parsedToolCalls, text } = parseMCPResponse(acc.text);
        const toolCalls = uniqueToolCalls(parsedToolCalls);

        if (toolCalls.length === 0) {
          // No tool calls — stream the final response for display
          const nextMessages = appendAssistantIfNonEmpty(iterMessages, text);
          if (nextMessages !== iterMessages) {
            iterMessages = nextMessages;
            commitMessages(iterMessages);
          }
          exhausted = false;
          break;
        }

        // Add assistant message with tool call indication
        iterMessages = appendAssistantIfNonEmpty(iterMessages, text);

        // Execute tool calls
        let needsConfirmStop = false;
        let executedToolCalls = 0;
        let allExecutedToolsTerminal = true;
        for (const call of toolCalls) {
          executedToolCalls++;
          allExecutedToolsTerminal &&= TOOL_METADATA[call.name].terminal;
          let result: ToolResult;
          try {
            result = await executeTool(keeper, call);
          } catch (toolErr: unknown) {
            iterMessages = [...iterMessages, toolErrorMessage(call, toolErr)];
            if (runId !== runIdRef.current) return;
            continue;
          }
          if (runId !== runIdRef.current) return;

          if (result.needsConfirmation) {
            // Pause for user confirmation
            const confirmationArgs = confirmationArgsFor(call);
            if (confirmationArgs === null) {
              throw new Error(`Tool "${call.name}" requested confirmation without confirmation args`);
            }
            const toolMsg = toolResultMessage(result);
            iterMessages = [...iterMessages, toolMsg];
            const pendingConfirmation = { toolResult: result, args: confirmationArgs };
            dispatch({ type: 'pauseForConfirmation', messages: iterMessages, pendingConfirmation });
            onMessagesChange?.(iterMessages);
            pausedForConfirmation = true;
            needsConfirmStop = true;
            break;
          }

          const toolMsg = toolResultMessage(result);
          iterMessages = [...iterMessages, toolMsg];
          onMutation();
        }
        if (needsConfirmStop) return;

        commitMessages(iterMessages);
        if (executedToolCalls > 0 && allExecutedToolsTerminal) {
          exhausted = false;
          break;
        }
      }

      // If we exhausted the iteration limit, inform the user
      if (exhausted) {
        const limitMsg: ChatMessage = {
          role: 'assistant',
          content: "I've reached the maximum number of actions. Please try a simpler request.",
        };
        iterMessages = [...iterMessages, limitMsg];
        commitMessages(iterMessages);
      }
    } catch (err: unknown) {
      if (runId !== runIdRef.current) return;
      dispatch({ type: 'setStreamingText', text: '' });
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Preserve any partially streamed text as an assistant message
        const nextMessages = appendAssistantIfNonEmpty(iterMessages, acc.text);
        if (nextMessages !== iterMessages) {
          commitMessages(nextMessages);
        }
      } else {
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
        const assistantMsg: ChatMessage = { role: 'assistant', content: `Error: ${errorMsg}` };
        commitMessages([...iterMessages, assistantMsg]);
      }
      return;
    } finally {
      if (runId === runIdRef.current) {
        abortRef.current = null;
        if (!pausedForConfirmation) {
          dispatch({ type: 'finishRun' });
        }
      }
    }
  }, [state.status, onMessagesChange, streamOnce, keeper, onMutation, commitMessages]);

  const send = useCallback(async (userInput: string) => {
    const newUserMsg: ChatMessage = { role: 'user', content: userInput };
    await completeFromMessages([...state.messages, newUserMsg]);
  }, [completeFromMessages, state.messages]);

  const replaceUserMessageAndRetry = useCallback(async (messageIndex: number, content: string) => {
    const trimmed = content.trim();
    if (trimmed === '' || state.messages[messageIndex]?.role !== 'user') return;
    await completeFromMessages([
      ...state.messages.slice(0, messageIndex),
      { role: 'user', content: trimmed },
    ]);
  }, [completeFromMessages, state.messages]);

  const regenerateAssistantMessage = useCallback(async (messageIndex: number) => {
    if (state.messages[messageIndex]?.role !== 'assistant') return;
    await completeFromMessages(state.messages.slice(0, messageIndex));
  }, [completeFromMessages, state.messages]);

  const confirmDelete = useCallback(async (confirmed: boolean) => {
    if (state.pendingConfirmation === null) return;
    const pendingConfirmation = state.pendingConfirmation;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    dispatch({ type: 'resolveConfirmation' });

    try {
      let toolMsg: ChatMessage;

      if (!confirmed) {
        toolMsg = {
          role: 'tool',
          content: 'Delete cancelled by user.',
          toolResult: { name: pendingConfirmation.toolResult.name, result: 'Delete cancelled by user.', needsConfirmation: false },
        };
      } else {
        const result = await executeConfirmedDelete(keeper, pendingConfirmation.args);
        toolMsg = toolResultMessage(result);
        onMutation();
      }
      if (runId !== runIdRef.current) return;

      // Build the updated message list with the confirmation result
      const updatedMessages: ChatMessage[] = [...state.messages, toolMsg];
      commitMessages(updatedMessages);

      // Send the confirmation result back to the LLM for a follow-up response
      const [recentNotes, allTags] = await Promise.all([keeper.notes.list(), keeper.tags.list()]);
      if (runId !== runIdRef.current) return;
      const llmMessages = buildLLMMessages(updatedMessages, recentNotes, allTags);
      const controller = new AbortController();
      abortRef.current = controller;

      const acc = { text: '' };
      await streamOnce(llmMessages, controller.signal, acc, runId);
      if (runId !== runIdRef.current) return;

      if (acc.text !== '') {
        const { text } = parseMCPResponse(acc.text);
        const nextMessages = appendAssistantIfNonEmpty(updatedMessages, text);
        if (nextMessages !== updatedMessages) {
          commitMessages(nextMessages);
        }
      }
    } catch (err: unknown) {
      if (runId !== runIdRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        dispatch({ type: 'setStreamingText', text: '' });
      } else {
        dispatch({ type: 'setStreamingText', text: '' });
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
        const assistantMsg: ChatMessage = { role: 'assistant', content: `Error: ${errorMsg}` };
        commitMessages([...state.messages, assistantMsg]);
      }
    } finally {
      if (runId === runIdRef.current) {
        dispatch({ type: 'finishRun' });
        abortRef.current = null;
      }
    }
  }, [state.pendingConfirmation, state.messages, keeper, onMutation, commitMessages, streamOnce]);

  const clear = useCallback(() => {
    runIdRef.current++;
    dispatch({ type: 'replaceMessages', messages: [] });
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const loadMessages = useCallback((nextMessages: ChatMessage[]) => {
    runIdRef.current++;
    dispatch({ type: 'replaceMessages', messages: nextMessages });
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
    messages: state.messages,
    loading: state.status === 'streaming',
    streaming: state.streamingText,
    pendingConfirmation: state.pendingConfirmation,
    send,
    replaceUserMessageAndRetry,
    regenerateAssistantMessage,
    confirmDelete,
    clear,
    loadMessages,
    cancel,
  };
}
