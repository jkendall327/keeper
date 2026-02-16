import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatLoop } from '../llm/useChatLoop.ts';
import type { LLMClient, ChatResponse, Message, ChatOptions } from '@motioneffector/llm';
import { createTestDb } from '../db/__tests__/test-db.ts';
import { createKeeperDB } from '../db/db-impl.ts';
import type { KeeperDB } from '../db/types.ts';

function createMockClient(streamTokens: string[]): LLMClient {
  return {
    chat: vi.fn<(messages: Message[], options?: ChatOptions) => Promise<ChatResponse>>(),
    stream(_messages: Message[], _options?: ChatOptions): AsyncIterable<string> {
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (i < streamTokens.length) {
                const token = streamTokens[i];
                if (token === undefined) throw new Error('unexpected undefined token');;
                i++;
                return Promise.resolve({ value: token, done: false as const });
              }
              return Promise.resolve({ value: undefined as unknown as string, done: true as const });
            },
          };
        },
      };
    },
    createConversation: vi.fn(),
    getModel: () => 'test-model',
    setModel: vi.fn(),
    estimateChat: vi.fn().mockReturnValue({ prompt: 0, available: 4096 }),
  };
}

describe('Streaming', () => {
  let db: KeeperDB;

  function setup(streamTokens: string[]) {
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(Date.now())}`,
      now: () => '2025-01-15 12:00:00',
    });
    const client = createMockClient(streamTokens);
    const onMutation = vi.fn();
    return { client, onMutation };
  }

  it('streams tokens and produces a final assistant message', async () => {
    const { client, onMutation } = setup(['Hello', ' world', '!']);
    const { result } = renderHook(() =>
      useChatLoop({ client, db, onMutation }),
    );

    await act(async () => {
      await result.current.send('Hi');
    });

    // After streaming completes, streaming should be cleared
    expect(result.current.streaming).toBe('');
    // Final assistant message should be the accumulated text
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.content).toBe('Hello world!');
  });

  it('handles stream with tool call block', async () => {
    const toolCallResponse = 'Let me look that up.\n\n```tool_call\n{"name": "list_notes", "args": {}}\n```';
    const finalResponse = 'You have no notes yet.';
    const { client, onMutation } = setup([toolCallResponse]);

    // After tool call, the client will be called again for the follow-up
    // Override stream to return final response on second call
    let callCount = 0;
    client.stream = (_messages: Message[], _options?: ChatOptions): AsyncIterable<string> => {
      callCount++;
      const tokens = callCount === 1 ? [toolCallResponse] : [finalResponse];
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (i < tokens.length) {
                const token = tokens[i];
                if (token === undefined) throw new Error('unexpected undefined token');;
                i++;
                return Promise.resolve({ value: token, done: false as const });
              }
              return Promise.resolve({ value: undefined as unknown as string, done: true as const });
            },
          };
        },
      };
    };

    const { result } = renderHook(() =>
      useChatLoop({ client, db, onMutation }),
    );

    await act(async () => {
      await result.current.send('Show my notes');
    });

    // Should have tool result in messages
    const toolMsgs = result.current.messages.filter(m => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0]?.content).toContain('No notes found');

    // Should have assistant messages: the tool-call text + the final response
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0]?.content).toContain('Let me look that up');
    expect(assistantMsgs[1]?.content).toBe('You have no notes yet.');
  });

  it('shows max iterations message when tool loop exhausted', async () => {
    // Every response triggers a tool call, so the loop should exhaust after MAX_TOOL_ITERATIONS (10)
    const toolCallText = '```tool_call\n{"name": "list_notes", "args": {}}\n```';
    const { onMutation } = setup([]);
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(Date.now())}`,
      now: () => '2025-01-15 12:00:00',
    });

    const client: LLMClient = {
      chat: vi.fn<(messages: Message[], options?: ChatOptions) => Promise<ChatResponse>>(),
      stream(_messages: Message[], _options?: ChatOptions): AsyncIterable<string> {
        // Always return a tool call, never a plain response
        let done = false;
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                if (!done) {
                  done = true;
                  return Promise.resolve({ value: toolCallText, done: false as const });
                }
                return Promise.resolve({ value: undefined as unknown as string, done: true as const });
              },
            };
          },
        };
      },
      createConversation: vi.fn(),
      getModel: () => 'test-model',
      setModel: vi.fn(),
      estimateChat: vi.fn().mockReturnValue({ prompt: 0, available: 4096 }),
    };

    const { result } = renderHook(() =>
      useChatLoop({ client, db, onMutation }),
    );

    await act(async () => {
      await result.current.send('Loop forever');
    });

    // The last assistant message should be the max iterations warning
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    if (lastAssistant === undefined) throw new Error('No assistant messages after max iterations');
    expect(lastAssistant.content).toContain('maximum number of actions');
  });

  it('preserves partial text on abort', async () => {
    // Create a stream that will be aborted mid-way
    const { onMutation } = setup([]);
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(Date.now())}`,
      now: () => '2025-01-15 12:00:00',
    });

    const client: LLMClient = {
      chat: vi.fn<(messages: Message[], options?: ChatOptions) => Promise<ChatResponse>>(),
      stream(_messages: Message[], options?: ChatOptions): AsyncIterable<string> {
        const tokens = ['Partial', ' response', ' here'];
        let i = 0;
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                if (i < tokens.length) {
                  // Abort after second token
                  if (i === 2 && options?.signal !== undefined) {
                    const err = new DOMException('Aborted', 'AbortError');
                    throw err;
                  }
                  const token = tokens[i];
                if (token === undefined) throw new Error('unexpected undefined token');;
                  i++;
                  return Promise.resolve({ value: token, done: false as const });
                }
                return Promise.resolve({ value: undefined as unknown as string, done: true as const });
              },
            };
          },
        };
      },
      createConversation: vi.fn(),
      getModel: () => 'test-model',
      setModel: vi.fn(),
      estimateChat: vi.fn().mockReturnValue({ prompt: 0, available: 4096 }),
    };

    const { result } = renderHook(() =>
      useChatLoop({ client, db, onMutation }),
    );

    await act(async () => {
      await result.current.send('Tell me something');
    });

    // After abort, the partial text should be preserved as an assistant message
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.content).toBe('Partial response');
  });
});
