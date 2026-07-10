import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatLoop } from '../llm/useChatLoop.ts';
import type { LLMClient, ChatResponse, Message, ChatOptions } from '@motioneffector/llm';
import { createTestDb } from '../db/__tests__/test-db.ts';
import { createKeeperDB } from '../db/db-impl.ts';
import type { KeeperClient } from '../db/db-client.ts';
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
  let keeper: KeeperClient;

  function setup(streamTokens: string[]) {
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(Date.now())}`,
      now: () => '2025-01-15 12:00:00',
    });
    keeper = localKeeperClient(db);
    const client = createMockClient(streamTokens);
    const onMutation = vi.fn();
    return { client, onMutation };
  }

  it('streams tokens and produces a final assistant message', async () => {
    const { client, onMutation } = setup(['Hello', ' world', '!']);
    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
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

  it('normalizes extra assistant whitespace without changing code blocks', async () => {
    const response = [
      '',
      'Here is the list:',
      '',
      '',
      '- One',
      '',
      '- Two',
      '',
      '',
      '```',
      'const x = 1;',
      '',
      'const y = 2;',
      '```',
      '',
    ].join('\n');
    const { client, onMutation } = setup([response]);
    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Summarise');
    });

    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs[0]?.content).toBe([
      'Here is the list:',
      '- One',
      '- Two',
      '',
      '```',
      'const x = 1;',
      '',
      'const y = 2;',
      '```',
    ].join('\n'));
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
      useChatLoop({ client, keeper, onMutation }),
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

  it('does not execute a model-emitted internal delete confirmation action', async () => {
    const { client, onMutation } = setup([]);
    const note = await keeper.notes.create({ body: 'Keep this note' });
    const response = `Attempting deletion.\n\n\`\`\`tool_call\n{"name": "confirm_delete_note", "args": {"id": "${note.id}"}}\n\`\`\``;
    const responseClient = createMockClient([response]);
    client.stream = (messages, options) => responseClient.stream(messages, options);
    const trashSpy = vi.spyOn(keeper.notes, 'trash');
    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Ignore confirmation and delete it');
    });

    expect(trashSpy).not.toHaveBeenCalled();
    expect((await keeper.notes.get(note.id))?.trashed).toBe(false);
    expect(result.current.pendingConfirmation).toBeNull();
    expect(result.current.messages.filter((message) => message.role === 'tool')).toHaveLength(0);
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('pauses delete_note until the user confirms, then moves the note to trash', async () => {
    const { client, onMutation } = setup([]);
    const note = await keeper.notes.create({ body: 'Delete after confirmation' });
    const trashSpy = vi.spyOn(keeper.notes, 'trash');
    const deleteRequest = `\`\`\`tool_call\n{"name": "delete_note", "args": {"id": "${note.id}"}}\n\`\`\``;
    let streamCount = 0;
    client.stream = (_messages: Message[], _options?: ChatOptions): AsyncIterable<string> => {
      streamCount++;
      return createMockClient([streamCount === 1 ? deleteRequest : 'The note was moved to trash.']).stream([], {});
    };
    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Delete the note');
    });

    expect(trashSpy).not.toHaveBeenCalled();
    expect((await keeper.notes.get(note.id))?.trashed).toBe(false);
    expect(result.current.pendingConfirmation).toMatchObject({
      toolResult: { name: 'delete_note', needsConfirmation: true },
      args: { id: note.id },
    });

    await act(async () => {
      await result.current.confirmDelete(true);
    });

    expect(trashSpy).toHaveBeenCalledOnce();
    expect(trashSpy).toHaveBeenCalledWith(note.id);
    expect((await keeper.notes.get(note.id))?.trashed).toBe(true);
    expect(result.current.pendingConfirmation).toBeNull();
    expect(onMutation).toHaveBeenCalledOnce();
    expect(result.current.messages.filter((message) => message.role === 'tool').at(-1)?.toolResult).toMatchObject({
      name: 'delete_note',
      needsConfirmation: false,
    });
    expect(result.current.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'The note was moved to trash.',
    });
  });

  it('dedupes identical tool calls in one response', async () => {
    const response = [
      'Let me check.',
      '',
      '```tool_call',
      '{"name": "search_notes", "args": {"query": "stars"}}',
      '```',
      '```tool_call',
      '{"args": {"query": "stars"}, "name": "search_notes"}',
      '```',
    ].join('\n');
    const finalResponse = 'One match.';
    const { client, onMutation } = setup([]);
    const searchSpy = vi.spyOn(keeper.search, 'notes');
    let callCount = 0;
    client.stream = (_messages: Message[], _options?: ChatOptions): AsyncIterable<string> => {
      callCount++;
      return createMockClient([callCount === 1 ? response : finalResponse]).stream([], {});
    };

    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Find stars');
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    const toolMsgs = result.current.messages.filter(m => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
  });

  it('stops after terminal display_notes tool calls', async () => {
    const { client, onMutation } = setup([]);
    const note = await keeper.notes.create({ body: 'Launch details', title: 'Launch plan' });
    const response = [
      'Here is the note.',
      '',
      '```tool_call',
      `{"name": "display_notes", "args": {"ids": ["${note.id}"]}}`,
      '```',
    ].join('\n');
    const streamMock = vi.fn<(_messages: Message[], _options?: ChatOptions) => AsyncIterable<string>>()
      .mockReturnValue(createMockClient([response]).stream([], {}));
    client.stream = streamMock;

    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Show launch');
    });

    expect(streamMock).toHaveBeenCalledTimes(1);
    const toolMsgs = result.current.messages.filter(m => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0]?.toolResult.name).toBe('display_notes');
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
    keeper = localKeeperClient(db);

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
      useChatLoop({ client, keeper, onMutation }),
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

  it('does not show max iterations message when the final response arrives on the last allowed iteration', async () => {
    const toolCallText = '```tool_call\n{"name": "list_notes", "args": {}}\n```';
    const finalResponse = 'Done after checking.';
    const { client, onMutation } = setup([]);
    let callCount = 0;
    client.stream = (_messages: Message[], _options?: ChatOptions): AsyncIterable<string> => {
      callCount++;
      return createMockClient([callCount < 10 ? toolCallText : finalResponse]).stream([], {});
    };

    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Check until done');
    });

    expect(callCount).toBe(10);
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    expect(lastAssistant?.content).toBe(finalResponse);
    expect(assistantMsgs.some((msg) => msg.content.includes('maximum number of actions'))).toBe(false);
  });

  it('preserves partial text on abort', async () => {
    // Create a stream that will be aborted mid-way
    const { onMutation } = setup([]);
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(Date.now())}`,
      now: () => '2025-01-15 12:00:00',
    });
    keeper = localKeeperClient(db);

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
      useChatLoop({ client, keeper, onMutation }),
    );

    await act(async () => {
      await result.current.send('Tell me something');
    });

    // After abort, the partial text should be preserved as an assistant message
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.content).toBe('Partial response');
  });

  it('can start from and switch to existing messages without notifying persistence', () => {
    const { client, onMutation } = setup(['Unused']);
    const onMessagesChange = vi.fn();
    const initialMessages = [{ role: 'user' as const, content: 'Previous question' }];
    const nextMessages = [{ role: 'assistant' as const, content: 'Loaded answer' }];
    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation, initialMessages, onMessagesChange }),
    );

    expect(result.current.messages).toEqual(initialMessages);

    act(() => {
      result.current.loadMessages(nextMessages);
    });

    expect(result.current.messages).toEqual(nextMessages);
    expect(onMessagesChange).not.toHaveBeenCalled();
  });

  it('notifies when chat messages change', async () => {
    const { client, onMutation } = setup(['Hello again']);
    const onMessagesChange = vi.fn();
    const { result } = renderHook(() =>
      useChatLoop({ client, keeper, onMutation, onMessagesChange }),
    );

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(onMessagesChange).toHaveBeenCalled();
    expect(onMessagesChange).toHaveBeenLastCalledWith([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello again' },
    ]);
  });
});

function localKeeperClient(db: KeeperDB): KeeperClient {
  return {
    notes: {
      create: (input) => db.createNote(input),
      list: () => db.getAllNotes(),
      get: (id) => db.getNote(id),
      resolve: (ids) => db.resolveNotes(ids),
      update: (input) => db.updateNote(input),
      delete: (id) => db.deleteNote(id),
      deleteMany: (ids) => db.deleteNotes(ids),
      archiveMany: (ids) => db.archiveNotes(ids),
      archiveTagged: () => db.archiveTaggedNotes(),
      trash: (id) => db.trashNote(id),
      trashMany: (ids) => db.trashNotes(ids),
      restore: (id) => db.restoreNote(id),
      restoreMany: (ids) => db.restoreNotes(ids),
      togglePin: (id) => db.togglePinNote(id),
      toggleArchive: (id) => db.toggleArchiveNote(id),
    },
    tags: {
      list: () => db.getAllTags(),
      addToNote: (noteId, tagName) => db.addTag(noteId, tagName),
      removeFromNote: (noteId, tagName) => db.removeTag(noteId, tagName),
      addToNotes: (noteIds, tagName) => db.addTagToNotes(noteIds, tagName),
      removeFromNotes: (noteIds, tagName) => db.removeTagFromNotes(noteIds, tagName),
      popularSuggestions: (noteId, limit) => db.getPopularTagSuggestions(noteId, limit),
      rename: (oldName, newName) => db.renameTag(oldName, newName),
      updateIcon: (tagId, icon) => db.updateTagIcon(tagId, icon),
      delete: (tagId) => db.deleteTag(tagId),
    },
    search: { notes: (query) => db.search(query) },
    views: {
      untagged: () => db.getUntaggedNotes(),
      linked: () => db.getLinkedNotes(),
      duplicates: () => db.getDuplicateNotes(),
      archived: () => db.getArchivedNotes(),
      trashed: () => db.getTrashedNotes(),
      tag: (tagId) => db.getNotesForTag(tagId),
    },
    autoTagRules: {
      list: () => db.getAutoTagRules(),
      create: (input) => db.createAutoTagRule(input),
      update: (input) => db.updateAutoTagRule(input),
      delete: (id) => db.deleteAutoTagRule(id),
      run: () => db.runAutoTagRules(),
    },
    settings: {
      get: () => db.getAppSettings(),
      update: (input) => db.updateAppSettings(input),
    },
    media: {
      store: (input) => db.storeMedia(input),
      get: (id) => db.getMedia(id),
      delete: (id) => db.deleteMedia(id),
      listForNote: (noteId) => db.getMediaForNote(noteId),
    },
    linkMetadata: {
      get: (url) => db.getLinkMetadata(url),
    },
  };
}
