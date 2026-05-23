import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderApp } from './app-test-utils';
import { ChatView } from '../components/ChatView.tsx';
import type { KeeperClient } from '../db/db-client.ts';
import { KeeperServicesProvider } from '../KeeperServicesProvider.tsx';
import { toNoteId, type NoteWithTags } from '../db/types.ts';
import type { LLMClient, ChatResponse, Message, ChatOptions } from '@motioneffector/llm';

function createChatViewClient(): LLMClient {
  return {
    chat: vi.fn<(messages: Message[], options?: ChatOptions) => Promise<ChatResponse>>(),
    stream: vi.fn<(_messages: Message[], _options?: ChatOptions) => AsyncIterable<string>>(),
    createConversation: vi.fn(),
    getModel: () => 'test-model',
    setModel: vi.fn(),
    estimateChat: vi.fn().mockReturnValue({ prompt: 0, available: 4096 }),
  };
}

function createChatViewKeeper(): KeeperClient {
  return {
    notes: { list: vi.fn().mockResolvedValue([]) },
    tags: { list: vi.fn().mockResolvedValue([]) },
  } as unknown as KeeperClient;
}

function makeNote(input: Omit<Partial<NoteWithTags>, 'id'> & { id: string; title: string; body: string }): NoteWithTags {
  return {
    id: toNoteId(input.id),
    title: input.title,
    body: input.body,
    has_links: false,
    pinned: input.pinned ?? false,
    archived: input.archived ?? false,
    trashed: input.trashed ?? false,
    created_at: '2025-01-15 12:00:00',
    updated_at: input.updated_at ?? '2025-01-15 12:00:00',
    tags: input.tags ?? [],
    link_metadata: [],
  };
}

function renderChatView(client: LLMClient, keeper: KeeperClient) {
  return render(
    <KeeperServicesProvider value={{ client: keeper, apiFetch: vi.fn() }}>
      <ChatView
        client={client}
        keeper={keeper}
        apiKey="test-key"
        advancedModeEnabled={false}
        onMutation={vi.fn()}
      />
    </KeeperServicesProvider>,
  );
}

async function* streamText(text: string): AsyncIterable<string> {
  await Promise.resolve();
  yield text;
}

describe('App chat view', () => {
  it('shows Chat entry in the sidebar', async () => {
    await renderApp();
    const chatBtn = screen.getByText('Chat');
    expect(chatBtn).toBeInTheDocument();
  });

  it('shows API key required when clicking Chat without a key', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('keeper-openrouter-key');
    await renderApp();

    const chatBtn = screen.getByText('Chat');
    await user.click(chatBtn);

    const keyRequired = await screen.findByText('API key required');
    expect(keyRequired).toBeInTheDocument();
    const hint = screen.getByText(/Configure your OpenRouter API key/);
    expect(hint).toBeInTheDocument();
  });

  it('hides notes view when Chat is active', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note first
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Test note');
    await user.keyboard('{Enter}');
    await screen.findByText('Test note');

    // Switch to Chat
    const chatBtn = screen.getByText('Chat');
    await user.click(chatBtn);

    // Note and search bar should not be visible
    await waitFor(() => {
      expect(screen.queryByText('Test note')).not.toBeInTheDocument();
    });
  });

  it('opens chat from a direct URL', async () => {
    await renderApp('/chat');

    expect(await screen.findByText('API key required')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search notes/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Clean up notes')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Take a note...')).not.toBeInTheDocument();
  });

  it('focuses the message input when the chat view opens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.removeItem('keeper-chat-conversations');

    renderChatView(createChatViewClient(), createChatViewKeeper());

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask about your notes...')).toHaveFocus();
    });
  });

  it('focuses the message input when starting a new conversation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'existing',
        title: 'Existing conversation',
        updatedAt: 1,
        messages: [{ role: 'user', content: 'Existing conversation' }],
      },
    ]));

    renderChatView(createChatViewClient(), createChatViewKeeper());
    const input = screen.getByPlaceholderText('Ask about your notes...');
    input.blur();
    await user.click(screen.getByRole('button', { name: 'New conversation' }));

    expect(input).toHaveFocus();
  });

  it('returns to notes view when switching back from Chat', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Persistent note');
    await user.keyboard('{Enter}');
    const noteCard = await screen.findByText('Persistent note');
    expect(noteCard).toBeInTheDocument();

    // Switch to Chat
    const chatBtn = screen.getByText('Chat');
    await user.click(chatBtn);

    // Switch back to Notes
    const notesBtn = screen.getByText('Inbox');
    await user.click(notesBtn);

    // Note should be visible again
    const restoredNote = await screen.findByText('Persistent note');
    expect(restoredNote).toBeInTheDocument();
  });

  it('shows stored conversations newest first', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'older',
        title: 'Older question',
        updatedAt: 1,
        messages: [{ role: 'user', content: 'Older question' }],
      },
      {
        id: 'recent',
        title: 'Recent question',
        updatedAt: 2,
        messages: [
          { role: 'user', content: 'Recent question' },
          { role: 'assistant', content: 'Recent answer' },
        ],
      },
    ]));

    render(
      <ChatView
        client={createChatViewClient()}
        keeper={createChatViewKeeper()}
        apiKey="test-key"
        advancedModeEnabled={false}
        onMutation={vi.fn()}
      />,
    );

    const historySelect = screen.getByLabelText('Recent conversations');
    expect(historySelect).toHaveValue('recent');
    expect(screen.getByText('Recent answer')).toBeInTheDocument();
    expect(within(historySelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Recent question',
      'Older question',
    ]);
  });

  it('copies user and assistant messages without adding copy buttons to tool messages', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'chat',
        title: 'Copyable chat',
        updatedAt: 1,
        messages: [
          { role: 'user', content: 'User question' },
          { role: 'assistant', content: 'Assistant answer' },
          {
            role: 'tool',
            content: 'Tool output',
            toolResult: {
              name: 'display_notes',
              result: 'Tool output',
              needsConfirmation: false,
            },
          },
        ],
      },
    ]));

    renderChatView(createChatViewClient(), createChatViewKeeper());

    const copyButtons = screen.getAllByRole('button', { name: /Copy .* message/ });
    expect(copyButtons).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Copy user message' }));
    await user.click(screen.getByRole('button', { name: 'Copy assistant message' }));

    expect(writeText).toHaveBeenNthCalledWith(1, 'User question');
    expect(writeText).toHaveBeenNthCalledWith(2, 'Assistant answer');
  });

  it('edits a user message, drops later history, and asks the LLM again', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'chat',
        title: 'Original question',
        updatedAt: 1,
        messages: [
          { role: 'user', content: 'Original question' },
          { role: 'assistant', content: 'Original answer' },
          { role: 'user', content: 'Later question' },
          { role: 'assistant', content: 'Later answer' },
        ],
      },
    ]));
    const streamMock = vi.fn<(_messages: Message[], _options?: ChatOptions) => AsyncIterable<string>>();
    streamMock.mockReturnValueOnce(streamText('Edited answer'));
    const client = { ...createChatViewClient(), stream: streamMock };

    renderChatView(client, createChatViewKeeper());
    const [firstEditButton] = screen.getAllByRole('button', { name: 'Edit user message' });
    if (firstEditButton === undefined) throw new Error('Missing edit button');
    await user.click(firstEditButton);
    const editInput = screen.getByLabelText('Edit message');
    await user.clear(editInput);
    await user.type(editInput, 'Edited question');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Edited answer')).toBeInTheDocument();
    expect(screen.getAllByText('Edited question')).toHaveLength(2);
    expect(screen.queryByText('Original answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Later question')).not.toBeInTheDocument();
    expect(streamMock).toHaveBeenCalledTimes(1);
    const llmMessages = streamMock.mock.calls[0]?.[0];
    expect(llmMessages?.map((message) => message.content)).toEqual([
      expect.any(String),
      'Edited question',
    ]);
  });

  it('regenerates an assistant message from the preceding history', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'chat',
        title: 'Question',
        updatedAt: 1,
        messages: [
          { role: 'user', content: 'Question' },
          { role: 'assistant', content: 'Old answer' },
          { role: 'user', content: 'Later question' },
        ],
      },
    ]));
    const streamMock = vi.fn<(_messages: Message[], _options?: ChatOptions) => AsyncIterable<string>>();
    streamMock.mockReturnValueOnce(streamText('Fresh answer'));
    const client = { ...createChatViewClient(), stream: streamMock };

    renderChatView(client, createChatViewKeeper());
    await user.click(screen.getByRole('button', { name: 'Regenerate assistant message' }));

    expect(await screen.findByText('Fresh answer')).toBeInTheDocument();
    expect(screen.queryByText('Old answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Later question')).not.toBeInTheDocument();
    expect(streamMock).toHaveBeenCalledTimes(1);
    const llmMessages = streamMock.mock.calls[0]?.[0];
    expect(llmMessages?.map((message) => message.content)).toEqual([
      expect.any(String),
      'Question',
    ]);
  });

  it('renders display_notes tool calls as note badges and opens the note modal', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    const note = makeNote({ id: 'n1', title: 'Launch plan', body: 'Current launch details' });
    const streamMock = vi.fn<(_messages: Message[], _options?: ChatOptions) => AsyncIterable<string>>();
    const client = { ...createChatViewClient(), stream: streamMock };
    streamMock.mockReturnValueOnce(streamText('```tool_call\n{"name":"display_notes","args":{"ids":["n1"]}}\n```'));
    const keeper = {
      notes: {
        list: vi.fn().mockResolvedValue([note]),
        resolve: vi.fn().mockResolvedValue([{ id: 'n1', status: 'found', note }]),
        get: vi.fn().mockResolvedValue(note),
        update: vi.fn().mockResolvedValue(note),
        delete: vi.fn().mockResolvedValue(undefined),
        trash: vi.fn().mockResolvedValue(undefined),
        restore: vi.fn().mockResolvedValue(undefined),
        togglePin: vi.fn().mockResolvedValue(note),
        toggleArchive: vi.fn().mockResolvedValue(note),
      },
      tags: {
        list: vi.fn().mockResolvedValue([]),
        addToNote: vi.fn().mockResolvedValue(note),
        removeFromNote: vi.fn().mockResolvedValue(note),
        popularSuggestions: vi.fn().mockResolvedValue([]),
      },
      settings: { get: vi.fn().mockResolvedValue({ linkPreviewDisplayEnabled: true }) },
      media: { listForNote: vi.fn().mockResolvedValue([]) },
      linkMetadata: { get: vi.fn().mockResolvedValue(null) },
    } as unknown as KeeperClient;

    renderChatView(client, keeper);
    await user.type(screen.getByPlaceholderText('Ask about your notes...'), 'show launch note');
    await user.click(screen.getByLabelText('Send message'));

    const badge = await screen.findByRole('button', { name: /Open note Launch plan/ });
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(badge).toHaveTextContent('Current launch details');
    await user.click(badge);
    expect(await screen.findByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Current launch details')).toBeInTheDocument();
  });

  it('hydrates stored note badges and greys out permanently deleted notes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'chat',
        title: 'Deleted note',
        updatedAt: 1,
        messages: [{
          role: 'tool',
          content: 'Displayed 0 notes.',
          toolResult: {
            name: 'display_notes',
            result: 'Displayed 0 notes.',
            needsConfirmation: false,
            noteLinks: [{ id: 'gone', status: 'found', note: {
              id: 'gone',
              title: 'Old title',
              bodyPreview: 'Old body',
              tags: [],
              pinned: false,
              archived: false,
              trashed: false,
              updated_at: '2025-01-15 12:00:00',
            } }],
          },
        }],
      },
    ]));
    const keeper = {
      notes: {
        list: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockResolvedValue([{ id: 'gone', status: 'missing', note: null }]),
      },
      tags: { list: vi.fn().mockResolvedValue([]) },
    } as unknown as KeeperClient;

    renderChatView(createChatViewClient(), keeper);

    const unavailable = await screen.findByRole('button', { name: 'Note gone unavailable' });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveTextContent('Unavailable');
  });

  it('opens trashed note links with restore controls', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    const note = makeNote({ id: 'trash-1', title: 'Discarded', body: 'Needs review', trashed: true });
    localStorage.setItem('keeper-chat-conversations', JSON.stringify([
      {
        id: 'chat',
        title: 'Trash',
        updatedAt: 1,
        messages: [{
          role: 'tool',
          content: 'Displayed 1 note.',
          toolResult: {
            name: 'display_notes',
            result: 'Displayed 1 note.',
            needsConfirmation: false,
            noteLinks: [{ id: 'trash-1', status: 'found', note: {
              id: 'trash-1',
              title: 'Discarded',
              bodyPreview: 'Needs review',
              tags: [],
              pinned: false,
              archived: false,
              trashed: true,
              updated_at: '2025-01-15 12:00:00',
            } }],
          },
        }],
      },
    ]));
    const keeper = {
      notes: {
        list: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockResolvedValue([{ id: 'trash-1', status: 'found', note }]),
        get: vi.fn().mockResolvedValue(note),
        update: vi.fn().mockResolvedValue(note),
        delete: vi.fn().mockResolvedValue(undefined),
        trash: vi.fn().mockResolvedValue(undefined),
        restore: vi.fn().mockResolvedValue(undefined),
        togglePin: vi.fn().mockResolvedValue(note),
        toggleArchive: vi.fn().mockResolvedValue(note),
      },
      tags: {
        list: vi.fn().mockResolvedValue([]),
        addToNote: vi.fn().mockResolvedValue(note),
        removeFromNote: vi.fn().mockResolvedValue(note),
        popularSuggestions: vi.fn().mockResolvedValue([]),
      },
      settings: { get: vi.fn().mockResolvedValue({ linkPreviewDisplayEnabled: true }) },
      media: { listForNote: vi.fn().mockResolvedValue([]) },
      linkMetadata: { get: vi.fn().mockResolvedValue(null) },
    } as unknown as KeeperClient;

    renderChatView(createChatViewClient(), keeper);
    await user.click(await screen.findByRole('button', { name: /Open note Discarded/ }));

    expect(await screen.findByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore note' })).toBeInTheDocument();
  });
});
