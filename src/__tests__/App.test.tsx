import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMockDB } from './mock-db';
import type { MockDB } from './mock-db';

// Mock the db-client module before importing App
const mockDB: MockDB = createMockDB();
let testVisibilityState: DocumentVisibilityState = 'visible';
let testDocumentHasFocus = true;

class TestEventSource {
  static instances: TestEventSource[] = [];
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(_url: string) {
    TestEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() { /* noop test double */ }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }
}

vi.mock('../db/db-client', () => ({
  getDB: () => mockDB,
}));

// Now import App after the mock is set up
const { default: App } = await import('../App');

/**
 * Render App and flush the Suspense boundary created by the `use()` hook
 * in useDB. Without `act`, the initial data-loading promise resolves as a
 * microtask that React's test scheduler never processes, leaving the
 * Suspense fallback stuck on screen.
 */
async function renderApp() {
  // Passing an async callback makes act() return a Promise that resolves
  // once React finishes processing the Suspense boundary from useDB's use() hook.
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => { render(<App />); });
}

function getNoteCardByText(text: string | RegExp) {
  const card = screen.getByText(text).closest<HTMLElement>('[data-note-id][role="button"]');
  if (card === null) throw new Error(`Note card not found for ${String(text)}`);
  return card;
}

function getSidebar() {
  return screen.getByRole('complementary', { name: 'Sidebar' });
}

function getSidebarTagButton(name: string) {
  return within(getSidebar()).getByRole('button', { name });
}

describe('App Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDB.reset();
    localStorage.clear();
    document.title = 'keeper';
    TestEventSource.instances = [];
    globalThis.EventSource = TestEventSource as unknown as typeof EventSource;
    testVisibilityState = 'visible';
    testDocumentHasFocus = true;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => testVisibilityState,
    });
    vi.spyOn(document, 'hasFocus').mockImplementation(() => testDocumentHasFocus);
  });

  it('creates and displays a note', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Test note');
    await user.keyboard('{Enter}');

    // Note should appear
    expect(await screen.findByText('Test note')).toBeInTheDocument();
    // Input should be cleared
    expect(input).toHaveValue('');
  });

  it('opens and edits a note in modal', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Original text');
    await user.keyboard('{Enter}');

    // Click to open modal
    const noteCard = await screen.findByText('Original text');
    await user.click(noteCard);

    // Edit in modal
    const titleInput = await screen.findByPlaceholderText('Title');
    const bodyInput = await screen.findByPlaceholderText('Note');

    await user.clear(titleInput);
    await user.type(titleInput, 'My Title');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Updated text');

    // Close with Escape
    await user.keyboard('{Escape}');

    // Verify changes
    expect(await screen.findByText('My Title')).toBeInTheDocument();
    expect(await screen.findByText('Updated text')).toBeInTheDocument();
  });

  it('opens image notes in a lightbox from the note modal', async () => {
    const user = userEvent.setup();
    await renderApp();

    const imageUrl = 'https://example.com/photo.jpg';
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, imageUrl);
    await user.keyboard('{Enter}');

    await user.click(await screen.findByAltText('Image note'));

    const modal = screen.getByRole('dialog', { name: 'Edit note' });

    await user.click(within(modal).getByRole('button', { name: 'Open image preview' }));

    const lightbox = screen.getByRole('dialog', { name: 'Image preview' });
    expect(within(lightbox).getByAltText('Image note')).toHaveAttribute('src', imageUrl);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
  });

  it('adds and removes tags', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Tagged note');
    await user.keyboard('{Enter}');

    // Open modal
    const noteCard = await screen.findByText('Tagged note');
    await user.click(noteCard);

    // Add tag
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'work');
    await user.keyboard('{Enter}');

    // Verify tag appears (exactly one tag chip with remove button)
    const tagChips = await screen.findAllByLabelText(/Remove tag/);
    expect(tagChips).toHaveLength(1);
    expect(tagChips[0]).toHaveAttribute('aria-label', 'Remove tag work');

    // Remove tag
    const removeButton = await screen.findByLabelText('Remove tag work');
    await user.click(removeButton);

    // Verify tag removed
    await waitFor(() => {
      expect(screen.queryByLabelText('Remove tag work')).not.toBeInTheDocument();
    });
  });

  it('stages a new tag on blur and creates it when the note modal closes', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Prospective tag note');
    await user.keyboard('{Enter}');

    await user.click(await screen.findByText('Prospective tag note'));

    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'halfway');
    await user.click(screen.getByPlaceholderText('Note'));

    expect(await screen.findByLabelText('Remove tag halfway')).toBeInTheDocument();
    await expect(mockDB.getAllTags()).resolves.toEqual([]);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Add tag...')).not.toBeInTheDocument();
    });

    await expect(mockDB.getAllTags()).resolves.toMatchObject([
      { name: 'halfway' },
    ]);
    const notes = await mockDB.getAllNotes();
    expect(notes.find((note) => note.body === 'Prospective tag note')?.tags.map((tag) => tag.name)).toEqual(['halfway']);
  });

  it('suggests popular tags in an empty note tag input until typing filters suggestions', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    for (const [body, tags] of [
      ['Work source 1', ['work', 'later']],
      ['Work source 2', ['work']],
      ['Alpha source', ['alpha']],
    ] as const) {
      await user.type(input, body);
      await user.keyboard('{Enter}');
      await user.click(await screen.findByText(body));
      const tagInput = await screen.findByPlaceholderText('Add tag...');
      for (const tag of tags) {
        await user.type(tagInput, tag);
        await user.keyboard('{Enter}');
      }
      await user.click(screen.getByLabelText('Close note'));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Add tag...')).not.toBeInTheDocument();
      });
    }

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    const limitInput = screen.getByLabelText('Popular tag suggestions');
    await user.clear(limitInput);
    await user.type(limitInput, '2');
    await user.click(within(limitInput.closest('div')?.nextElementSibling as HTMLElement).getByText('Save'));
    await waitFor(async () => {
      await expect(mockDB.getAppSettings()).resolves.toMatchObject({ popularTagSuggestionLimit: 2 });
    });
    await user.click(screen.getByLabelText('Close settings'));

    await user.type(input, 'Target note');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByText('Target note'));
    const targetTagInput = await screen.findByPlaceholderText('Add tag...');
    await user.click(targetTagInput);
    const noteDialog = screen.getByRole('dialog', { name: 'Edit note' });

    const popularSuggestions = await waitFor(() => within(noteDialog).getAllByRole('option').map((element) => element.textContent));
    expect(popularSuggestions).toEqual(['work', 'alpha']);

    await user.type(targetTagInput, 'la');
    await waitFor(() => {
      const filteredSuggestions = within(noteDialog).getAllByRole('option').map((element) => element.textContent);
      expect(filteredSuggestions).toEqual(['later']);
    });

    await user.clear(targetTagInput);
    const workSuggestion = await waitFor(() => {
      const suggestion = within(noteDialog).getAllByRole('option').find(
        (element) => element.textContent === 'work',
      );
      if (suggestion === undefined) throw new Error('work suggestion not found');
      return suggestion;
    });
    await user.click(workSuggestion);

    expect(await screen.findByLabelText('Remove tag work')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(targetTagInput);

    await user.click(screen.getByLabelText('Close note'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Add tag...')).not.toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    await user.click(screen.getByRole('checkbox', { name: /Suggest popular tags in empty tag fields/ }));
    await waitFor(async () => {
      await expect(mockDB.getAppSettings()).resolves.toMatchObject({ popularTagSuggestionsEnabled: false });
    });
    await user.click(screen.getByLabelText('Close settings'));

    await user.type(input, 'Suggestions disabled note');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByText('Suggestions disabled note'));
    const disabledTagInput = await screen.findByPlaceholderText('Add tag...');
    await user.click(disabledTagInput);
    const disabledNoteDialog = screen.getByRole('dialog', { name: 'Edit note' });

    expect(within(disabledNoteDialog).queryAllByRole('option')).toHaveLength(0);

    await user.type(disabledTagInput, 'alp');
    await waitFor(() => {
      const filteredSuggestions = within(disabledNoteDialog).getAllByRole('option').map((element) => element.textContent);
      expect(filteredSuggestions).toEqual(['alpha']);
    });
  });

  it('deletes a note', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Delete me');
    await user.keyboard('{Enter}');

    await screen.findByText('Delete me');
    const noteCard = getNoteCardByText('Delete me');

    // Click delete button
    await user.click(within(noteCard).getByLabelText('Delete note'));

    // Verify deleted
    await waitFor(() => {
      expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
    });
  });

  it('copies note content from the note card action', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Copy me');
    await user.keyboard('{Enter}');

    await screen.findByText('Copy me');
    const noteCard = getNoteCardByText('Copy me');

    await user.click(within(noteCard).getByLabelText('Copy note'));

    expect(writeText).toHaveBeenCalledWith('Copy me');
    expect(screen.queryByPlaceholderText('Add tag...')).not.toBeInTheDocument();
  });

  it('shows modal note actions and copies the current modal body', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Copy from modal');
    await user.keyboard('{Enter}');

    await user.click(await screen.findByText('Copy from modal'));
    const modal = screen.getByRole('dialog', { name: 'Edit note' });

    const bodyInput = within(modal).getByPlaceholderText('Note');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Unsaved modal copy');

    expect(within(modal).getByLabelText('Archive note')).toBeInTheDocument();
    expect(within(modal).getByLabelText('Delete note')).toBeInTheDocument();
    expect(within(modal).getByLabelText('Pin note')).toBeInTheDocument();

    await user.click(within(modal).getByLabelText('Copy note'));

    expect(writeText).toHaveBeenCalledWith('Unsaved modal copy');
  });

  it('archives from the modal without switching to the archive view', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Keep visible');
    await user.keyboard('{Enter}');
    await screen.findByText('Keep visible');
    await user.type(input, 'Archive from modal');
    await user.keyboard('{Enter}');

    await user.click(await screen.findByText('Archive from modal'));
    const modal = screen.getByRole('dialog', { name: 'Edit note' });

    await user.click(within(modal).getByLabelText('Archive note'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Note')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Archive from modal')).not.toBeInTheDocument();
    expect(screen.getByText('Keep visible')).toBeInTheDocument();
  });

  it('shows multiple notes', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');

    // Create three notes
    for (const text of ['Note 1', 'Note 2', 'Note 3']) {
      await user.type(input, text);
      await user.keyboard('{Enter}');
      await screen.findByText(text);
    }

    // All visible
    expect(screen.getByText('Note 1')).toBeInTheDocument();
    expect(screen.getByText('Note 2')).toBeInTheDocument();
    expect(screen.getByText('Note 3')).toBeInTheDocument();
  });

  it('closes modal by clicking backdrop', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create and open note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Modal test');
    await user.keyboard('{Enter}');

    const noteCard = await screen.findByText('Modal test');
    await user.click(noteCard);

    // Wait for modal
    await screen.findByDisplayValue('Modal test');

    // Click backdrop
    await user.click(screen.getByTestId('note-modal-backdrop'));

    // Modal closed
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Modal test')).not.toBeInTheDocument();
    });
  });

  it('deletes note when body cleared in modal', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Clear me');
    await user.keyboard('{Enter}');

    // Open modal
    const noteCard = await screen.findByText('Clear me');
    await user.click(noteCard);

    // Clear body
    const bodyInput = await screen.findByPlaceholderText('Note');
    await user.clear(bodyInput);
    await user.keyboard('{Escape}');

    // Note deleted
    await waitFor(() => {
      expect(screen.queryByText('Clear me')).not.toBeInTheDocument();
    });
  });

  it('settings button renders the settings icon glyph', async () => {
    await renderApp();

    const settingsBtn = screen.getByLabelText('Open settings');
    expect(settingsBtn).toHaveTextContent('settings');
  });

  it('note card action buttons use Material Symbol icons', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Icon test');
    await user.keyboard('{Enter}');

    await screen.findByText('Icon test');
    const noteCard = getNoteCardByText('Icon test');

    // Pin button should render the push_pin glyph name for the icon font.
    expect(within(noteCard).getByLabelText('Pin note')).toHaveTextContent('push_pin');

    // Delete button should render the delete glyph name.
    expect(within(noteCard).getByLabelText('Delete note')).toHaveTextContent('delete');
  });

  it('pinning a note updates the pin action state', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Pin me');
    await user.keyboard('{Enter}');

    await screen.findByText('Pin me');
    const noteCard = getNoteCardByText('Pin me');

    // Initially not pinned
    expect(within(noteCard).getByLabelText('Pin note')).toBeInTheDocument();

    // Pin the note
    await user.click(within(noteCard).getByLabelText('Pin note'));

    // After pinning, the action reflects the pinned state
    await waitFor(() => {
      expect(within(getNoteCardByText('Pin me')).getByLabelText('Unpin note')).toBeInTheDocument();
    });
  });

  it('shows empty-note deletion warning when body is cleared', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Warning test');
    await user.keyboard('{Enter}');

    // Open modal
    const noteCard = await screen.findByText('Warning test');
    await user.click(noteCard);

    // Warning should not be visible initially
    expect(screen.queryByText('This note will be deleted when closed.')).not.toBeInTheDocument();

    // Clear body
    const bodyInput = await screen.findByPlaceholderText('Note');
    await user.clear(bodyInput);

    // Warning should appear
    expect(await screen.findByText('This note will be deleted when closed.')).toBeInTheDocument();

    // Type something back
    await user.type(bodyInput, 'Saved');

    // Warning should disappear
    await waitFor(() => {
      expect(screen.queryByText('This note will be deleted when closed.')).not.toBeInTheDocument();
    });
  });

  it('ctrl-click toggles note selection without opening modal', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    for (const text of ['Note A', 'Note B', 'Note C']) {
      await user.type(input, text);
      await user.keyboard('{Enter}');
      await screen.findByText(text);
    }

    // Ctrl-click Note A (hold Ctrl, click, release)
    const noteA = await screen.findByText('Note A');
    await user.keyboard('{Control>}');
    await user.click(noteA);
    await user.keyboard('{/Control}');

    // Note A should be selected
    const cardA = getNoteCardByText('Note A');
    expect(cardA).toHaveAttribute('aria-pressed', 'true');

    // Modal should NOT open
    expect(screen.queryByPlaceholderText('Title')).not.toBeInTheDocument();

    // Ctrl-click Note B
    const noteB = await screen.findByText('Note B');
    await user.keyboard('{Control>}');
    await user.click(noteB);
    await user.keyboard('{/Control}');

    // Both A and B should be selected
    const cardB = getNoteCardByText('Note B');
    expect(cardA).toHaveAttribute('aria-pressed', 'true');
    expect(cardB).toHaveAttribute('aria-pressed', 'true');

    // Ctrl-click A again to deselect
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Note A'));
    await user.keyboard('{/Control}');

    // A deselected, B still selected
    await waitFor(() => {
      expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'false');
      expect(getNoteCardByText('Note B')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('shift-click selects a range of notes', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    for (const text of ['Note A', 'Note B', 'Note C', 'Note D', 'Note E']) {
      await user.type(input, text);
      await user.keyboard('{Enter}');
      await screen.findByText(text);
    }

    // Ctrl-click Note A to select it (and set lastClicked)
    const noteA = await screen.findByText('Note A');
    await user.keyboard('{Control>}');
    await user.click(noteA);
    await user.keyboard('{/Control}');

    // Shift-click Note C to select range A-C
    const noteC = await screen.findByText('Note C');
    await user.keyboard('{Shift>}');
    await user.click(noteC);
    await user.keyboard('{/Shift}');

    // Exactly notes A, B, C should be selected — verified via count + identity
    await waitFor(() => {
      // Count via semantic query and verify each check is inside a selected card
      const checks = screen.getAllByLabelText('Selected');
      expect(checks).toHaveLength(3);
      const check0 = checks[0];
      const check1 = checks[1];
      const check2 = checks[2];
      if (check0 === undefined || check1 === undefined || check2 === undefined) throw new Error('Missing checks');
      const checkCard0 = check0.closest('[data-note-id][role="button"]');
      const checkCard1 = check1.closest('[data-note-id][role="button"]');
      const checkCard2 = check2.closest('[data-note-id][role="button"]');
      if (checkCard0 === null) throw new Error('Check 0 not inside a note card');
      if (checkCard1 === null) throw new Error('Check 1 not inside a note card');
      if (checkCard2 === null) throw new Error('Check 2 not inside a note card');
      expect(checkCard0).toHaveAttribute('aria-pressed', 'true');
      expect(checkCard1).toHaveAttribute('aria-pressed', 'true');
      expect(checkCard2).toHaveAttribute('aria-pressed', 'true');
      // Verify the specific cards are the right ones
      expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'true');
      expect(getNoteCardByText('Note B')).toHaveAttribute('aria-pressed', 'true');
      expect(getNoteCardByText('Note C')).toHaveAttribute('aria-pressed', 'true');
    });

    // D and E should not be selected
    expect(getNoteCardByText('Note D')).toHaveAttribute('aria-pressed', 'false');
    expect(getNoteCardByText('Note E')).toHaveAttribute('aria-pressed', 'false');
  });

  it('plain click in selection mode toggles selection instead of opening modal', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    for (const text of ['Note A', 'Note B']) {
      await user.type(input, text);
      await user.keyboard('{Enter}');
      await screen.findByText(text);
    }

    // Ctrl-click to select Note A
    const noteA = await screen.findByText('Note A');
    await user.keyboard('{Control>}');
    await user.click(noteA);
    await user.keyboard('{/Control}');

    const cardA = getNoteCardByText('Note A');
    expect(cardA).toHaveAttribute('aria-pressed', 'true');

    // Plain click on Note B — should add it to selection (not open modal)
    const noteB = await screen.findByText('Note B');
    await user.click(noteB);

    // Modal should NOT open
    expect(screen.queryByPlaceholderText('Title')).not.toBeInTheDocument();

    // Both notes should now be selected
    expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'true');
    expect(getNoteCardByText('Note B')).toHaveAttribute('aria-pressed', 'true');

    // Plain click on Note A again — should deselect it
    await user.click(screen.getByText('Note A'));
    expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'false');
    expect(getNoteCardByText('Note B')).toHaveAttribute('aria-pressed', 'true');

    // Deselect Note B — should exit selection mode
    await user.click(screen.getByText('Note B'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Selected')).not.toBeInTheDocument();
    });
  });

  it('Ctrl+/ focuses the search input', async () => {
    await renderApp();

    const searchInput = screen.getByPlaceholderText(/Search notes/);
    expect(document.activeElement).not.toBe(searchInput);

    // Fire Ctrl+/
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }),
      );
    });

    expect(document.activeElement).toBe(searchInput);
  });

  it('Ctrl+N returns focus to quick add and clears transient state', async () => {
    const user = userEvent.setup();
    await renderApp();

    const quickAdd = await screen.findByPlaceholderText('Take a note...');
    await user.type(quickAdd, 'Capture target');
    await user.keyboard('{Enter}');

    await screen.findByText('Capture target');
    const noteCard = getNoteCardByText('Capture target');

    await user.keyboard('{Control>}');
    await user.click(noteCard);
    await user.keyboard('{/Control}');
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search notes/);
    await user.type(searchInput, 'zzzznotfound');
    expect(await screen.findByText('No results found')).toBeInTheDocument();

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      searchInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }),
      );
    });

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(quickAdd);
    });
  });

  it('shows result count when searching and "No results found" for no matches', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Searchable note');
    await user.keyboard('{Enter}');
    await screen.findByText('Searchable note');

    // No result count before searching
    expect(screen.queryByText(/result/i)).not.toBeInTheDocument();

    // Type a matching query
    const searchInput = screen.getByPlaceholderText(/Search notes/);
    await user.type(searchInput, 'Searchable');

    // Result count should appear
    expect(await screen.findByText(/1 result/)).toBeInTheDocument();

    // Clear and type a non-matching query
    await user.clear(searchInput);
    await user.type(searchInput, 'zzzznotfound');

    // "No results found" should appear
    expect(await screen.findByText('No results found')).toBeInTheDocument();

    // Escape clears search
    await user.keyboard('{Escape}');

    // Count/message should be gone
    await waitFor(() => {
      expect(screen.queryByText(/result/i)).not.toBeInTheDocument();
      expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    });
  });

  it('Links sidebar filter shows only notes containing URLs', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');

    // Create a note with a URL (markdown renders the URL as an <a> tag)
    await user.type(input, 'Check https://example.com for details');
    await user.keyboard('{Enter}');

    // Wait for the link to appear — the URL is rendered as an anchor element
    const urlLink = await screen.findByText('https://example.com');
    expect(urlLink.tagName).toBe('A');
    expect(urlLink).toHaveAttribute('href', 'https://example.com');

    // Create a plain note
    await user.type(input, 'No links here');
    await user.keyboard('{Enter}');
    await screen.findByText('No links here');

    // Both notes visible initially
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('No links here')).toBeInTheDocument();

    // Click "Links" in sidebar
    const linksBtn = screen.getByText('Links');
    await user.click(linksBtn);

    // Only the URL note should be visible
    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
      expect(screen.queryByText('No links here')).not.toBeInTheDocument();
    });
  });

  it('tag sidebar filter shows notes with the selected tag', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');

    await user.type(input, 'Tagged work note');
    await user.keyboard('{Enter}');
    await user.type(input, 'Plain untagged note');
    await user.keyboard('{Enter}');
    await screen.findByText('Plain untagged note');

    await user.click(await screen.findByText('Tagged work note'));
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'work');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    const workTag = await waitFor(() => getSidebarTagButton('work'));

    await user.click(workTag);

    await waitFor(() => {
      expect(screen.getByText('Tagged work note')).toBeInTheDocument();
      expect(screen.queryByText('Plain untagged note')).not.toBeInTheDocument();
    });
  });

  it('archives tagged notes from the inbox header only', async () => {
    const user = userEvent.setup();
    await renderApp();

    const archiveTaggedBtn = await screen.findByRole('button', { name: 'Archive tagged notes' });
    expect(archiveTaggedBtn).toBeDisabled();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Tagged inbox note');
    await user.keyboard('{Enter}');
    await user.type(input, 'Plain inbox note');
    await user.keyboard('{Enter}');
    await screen.findByText('Plain inbox note');

    await user.click(await screen.findByText('Tagged inbox note'));
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'work');
    await user.keyboard('{Enter}');
    await screen.findByLabelText('Remove tag work');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(archiveTaggedBtn).toBeEnabled();
    });

    const workTag = await waitFor(() => getSidebarTagButton('work'));

    await user.click(workTag);
    expect(screen.queryByRole('button', { name: 'Archive tagged notes' })).not.toBeInTheDocument();

    await user.click(screen.getByText('Inbox'));
    const searchInput = screen.getByPlaceholderText(/Search notes/);
    await user.type(searchInput, 'Plain');
    expect(screen.getByText('Plain inbox note')).toBeInTheDocument();
    expect(screen.queryByText('Tagged inbox note')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archive tagged notes' }));
    await user.clear(searchInput);

    await waitFor(() => {
      expect(screen.queryByText('Tagged inbox note')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Plain inbox note')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Archive$/ }));
    await screen.findByText('Tagged inbox note');
    expect(screen.queryByRole('button', { name: 'Archive tagged notes' })).not.toBeInTheDocument();
  });

  it('does not reopen a stale modal after removing the active tag from a note', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Former foo note');
    await user.keyboard('{Enter}');

    await user.click(await screen.findByText('Former foo note'));
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'foo');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    const fooTag = await waitFor(() => getSidebarTagButton('foo'));

    await user.click(fooTag);
    await user.click(await screen.findByText('Former foo note'));
    await user.click(await screen.findByLabelText('Remove tag foo'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
      expect(screen.queryByText('Former foo note')).not.toBeInTheDocument();
    });

    await user.click(screen.getByText('Untagged'));

    await waitFor(() => {
      expect(screen.getByText('Former foo note')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
    });
  });

  it('does not reopen a stale modal after adding a tag to an untagged note', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'New foo note');
    await user.keyboard('{Enter}');

    await user.click(screen.getByText('Untagged'));
    await user.click(await screen.findByText('New foo note'));
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'foo');
    await user.keyboard('{Enter}');

    expect(screen.getByLabelText('Remove tag foo')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
      expect(screen.queryByText('New foo note')).not.toBeInTheDocument();
    });

    const fooTag = await waitFor(() => getSidebarTagButton('foo'));

    await user.click(fooTag);

    await waitFor(() => {
      expect(screen.getByText('New foo note')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
    });
  });

  it('applies the active tag to notes created from a tag view when enabled', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Existing cats note');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByText('Existing cats note'));
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'cats');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    const catsTag = await waitFor(() => getSidebarTagButton('cats'));

    await user.click(catsTag);
    await user.type(input, 'New kitten thought');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('New kitten thought')).toBeInTheDocument();
    const allNotes = await mockDB.getAllNotes();
    const created = allNotes.find((note) => note.body === 'New kitten thought');
    expect(created?.tags.map((tag) => tag.name)).toEqual(['cats']);
  });

  it('does not apply the active tag to new tag-view notes when disabled', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Existing cats note');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByText('Existing cats note'));
    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'cats');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    await user.click(screen.getByRole('checkbox', { name: /Apply current tag to new notes/ }));
    await user.click(screen.getByLabelText('Close settings'));

    const catsTag = await waitFor(() => getSidebarTagButton('cats'));

    await user.click(catsTag);
    await user.type(input, 'Loose kitten thought');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByText('Loose kitten thought')).not.toBeInTheDocument();
    });
    const allNotes = await mockDB.getAllNotes();
    const created = allNotes.find((note) => note.body === 'Loose kitten thought');
    expect(created?.tags).toEqual([]);
  });

  it('burn button appears only after export and deletes notes on click', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');

    // Create two notes
    await user.type(input, 'Burn note 1');
    await user.keyboard('{Enter}');
    await screen.findByText('Burn note 1');

    await user.type(input, 'Burn note 2');
    await user.keyboard('{Enter}');
    await screen.findByText('Burn note 2');

    // Ctrl-click both to select
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Burn note 1'));
    await user.click(screen.getByText('Burn note 2'));
    await user.keyboard('{/Control}');

    // Open export modal
    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Export'));

    // Export modal should open
    await screen.findByText('Copy to clipboard');

    // Burn button should NOT be visible before export
    expect(screen.queryByText(/Permanently delete/)).not.toBeInTheDocument();

    // Click download (triggers export completion)
    await user.click(screen.getByText('Download .txt'));

    // Burn button should now appear
    const burnBtn = await screen.findByText(/Permanently delete/);
    expect(burnBtn).toBeInTheDocument();

    // Click burn — notes should be deleted after confirmation
    // The handleBulkDelete uses window.confirm; jsdom doesn't provide it by default
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    await user.click(burnBtn);

    // Notes should be deleted
    await waitFor(() => {
      expect(screen.queryByText('Burn note 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Burn note 2')).not.toBeInTheDocument();
    });

    window.confirm = originalConfirm;
  });

  it('tag chips in note cards show a material icon', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note and add a tag
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Tag icon test');
    await user.keyboard('{Enter}');

    const noteCard = await screen.findByText('Tag icon test');
    await user.click(noteCard);

    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'work');
    await user.keyboard('{Enter}');

    // Close modal
    await user.keyboard('{Escape}');

    // The tag chip in the card should contain a material icon
    await waitFor(() => {
      expect(within(getNoteCardByText('Tag icon test')).getByTestId('note-card-tag-work')).toHaveTextContent('label');
    });
  });

  it('sidebar icon picker updates tag icon', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note and add a tag
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Icon picker test');
    await user.keyboard('{Enter}');

    const noteCard = await screen.findByText('Icon picker test');
    await user.click(noteCard);

    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'work');
    await user.keyboard('{Enter}');

    // Close modal
    await user.keyboard('{Escape}');

    // Find the icon button in the sidebar for the "work" tag
    const iconBtn = await screen.findByLabelText('Change icon for work');
    expect(iconBtn).toBeInTheDocument();

    // Default icon should be 'label'
    expect(iconBtn).toHaveTextContent('label');

    // Click to open icon picker
    await user.click(iconBtn);

    // Verify picker dialog appeared
    const dialog = screen.getByRole('dialog', { name: 'Choose an icon' });
    expect(dialog).toBeInTheDocument();

    // Click the "star" icon in the picker
    const starButton = screen.getByTitle('star');
    await user.click(starButton);

    // Verify the sidebar tag icon updated to 'star'
    await waitFor(() => {
      expect(iconBtn).toHaveTextContent('star');
    });
  });

  it('double-click sidebar tag enters inline rename mode', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note and add a tag
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Rename tag test');
    await user.keyboard('{Enter}');

    const noteCard = await screen.findByText('Rename tag test');
    await user.click(noteCard);

    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'oldname');
    await user.keyboard('{Enter}');

    await user.keyboard('{Escape}');

    // Wait for the tag to appear in the sidebar
    const sidebarTag = await waitFor(() => getSidebarTagButton('oldname'));

    // Double-click the tag name to rename
    await user.dblClick(sidebarTag);

    // An input should appear with the tag name
    const renameInput = await screen.findByDisplayValue('oldname');
    expect(renameInput).toBeInTheDocument();
    expect(renameInput.tagName).toBe('INPUT');

    // Type new name and press Enter
    await user.clear(renameInput);
    await user.type(renameInput, 'newname');
    await user.keyboard('{Enter}');

    // The tag should now be renamed in the sidebar
    await waitFor(() => {
      expect(within(getSidebar()).getByRole('button', { name: 'newname' })).toBeInTheDocument();
      expect(within(getSidebar()).queryByRole('button', { name: 'oldname' })).not.toBeInTheDocument();
    });
  });

  it('sidebar tag shows delete button on hover that removes the tag', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note and add a tag
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Delete tag test');
    await user.keyboard('{Enter}');

    const noteCard = await screen.findByText('Delete tag test');
    await user.click(noteCard);

    const tagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(tagInput, 'removeme');
    await user.keyboard('{Enter}');

    await user.keyboard('{Escape}');

    // Wait for tag in sidebar
    await waitFor(() => {
      expect(getSidebarTagButton('removeme')).toBeInTheDocument();
    });

    // Find the delete button (it's always in the DOM, just hidden with opacity)
    const deleteBtn = screen.getByLabelText('Delete tag removeme');
    expect(deleteBtn).toBeInTheDocument();

    // Click the delete button
    await user.click(deleteBtn);

    // Tag should be removed from sidebar
    await waitFor(() => {
      expect(screen.queryByLabelText('Delete tag removeme')).not.toBeInTheDocument();
    });
  });

  it('shows welcoming empty state when there are no notes', async () => {
    await renderApp();

    // With no notes, the welcome message and hint should be visible
    const heading = screen.getByText('No notes yet');
    expect(heading).toBeInTheDocument();
    const hint = screen.getByText('Start typing above to capture a note');
    expect(hint).toBeInTheDocument();

    // Only ONE notes empty state element should exist in the DOM (no duplicate from NoteGrid)
    const emptyState = screen.getByTestId('notes-empty-state');
    expect(screen.getAllByTestId('notes-empty-state')).toHaveLength(1);
    expect(emptyState).toHaveTextContent('No notes yet');

    // The empty state container should contain the sticky note glyph name.
    expect(emptyState).toHaveTextContent('sticky_note_2');
  });

  it('hides empty state after creating a note', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Welcome visible initially
    expect(screen.getByText('No notes yet')).toBeInTheDocument();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'First note');
    await user.keyboard('{Enter}');

    // Welcome should disappear
    await waitFor(() => {
      expect(screen.queryByText('No notes yet')).not.toBeInTheDocument();
    });
  });

  it('does not show empty state when a non-default filter is active', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Welcome should be visible initially on the all filter
    expect(screen.getByText('No notes yet')).toBeInTheDocument();

    // Switch to the Untagged filter
    const untaggedBtn = screen.getByText('Untagged');
    await user.click(untaggedBtn);

    // Welcome should disappear since we're not on the default 'all' view
    await waitFor(() => {
      expect(screen.queryByText('No notes yet')).not.toBeInTheDocument();
    });

    // Switch back to Notes (all) - welcome should reappear
    const notesBtn = screen.getByText('Inbox');
    await user.click(notesBtn);
    await waitFor(() => {
      expect(screen.getByText('No notes yet')).toBeInTheDocument();
    });
  });

  it('does not show empty state when search has no results', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note first
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Hello world');
    await user.keyboard('{Enter}');
    await screen.findByText('Hello world');

    // Search for something that doesn't match
    const searchInput = screen.getByPlaceholderText(/Search notes/);
    await user.type(searchInput, 'zzzznotfound');

    // Should show "No results found" but NOT the welcome empty state
    await screen.findByText('No results found');
    expect(screen.queryByText('No notes yet')).not.toBeInTheDocument();
  });

  describe('Settings modal', () => {
    it('opens settings modal when gear icon is clicked', async () => {
      const user = userEvent.setup();
      await renderApp();

      const settingsBtn = screen.getByLabelText('Open settings');
      await user.click(settingsBtn);

      const heading = screen.getByText('Settings');
      expect(heading).toBeInTheDocument();
      const keyLabel = screen.getByLabelText('OpenRouter API Key');
      expect(keyLabel).toBeInTheDocument();
    });

    it('API key input has type=password', async () => {
      const user = userEvent.setup();
      await renderApp();

      const settingsBtn = screen.getByLabelText('Open settings');
      await user.click(settingsBtn);

      const keyInput = screen.getByLabelText('OpenRouter API Key');
      expect(keyInput).toHaveAttribute('type', 'password');
    });

    it('closes settings modal on backdrop click', async () => {
      const user = userEvent.setup();
      await renderApp();

      const settingsBtn = screen.getByLabelText('Open settings');
      await user.click(settingsBtn);
      expect(screen.getByText('Settings')).toBeInTheDocument();

      await user.click(screen.getByTestId('settings-modal-backdrop'));

      await waitFor(() => {
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
      });
    });

    it('saves and clears API key via settings UI', async () => {
      const user = userEvent.setup();
      await renderApp();

      const settingsBtn = screen.getByLabelText('Open settings');
      await user.click(settingsBtn);

      const keyInput = screen.getByLabelText('OpenRouter API Key');
      await user.type(keyInput, 'sk-or-test-key');

      const saveBtn = screen.getByText('Save');
      await user.click(saveBtn);

      // Should show saved confirmation and configured status
      await screen.findByText('Saved!');
      const status = screen.getByText('Configured');
      expect(status).toBeInTheDocument();

      // Should be stored in localStorage
      const storedKey = localStorage.getItem('keeper-openrouter-key');
      expect(storedKey).toBe('sk-or-test-key');

      // Clear the key
      const clearBtn = screen.getByText('Clear key');
      await user.click(clearBtn);

      // Status should change to not configured
      const notConfigured = screen.getByText('Not configured');
      expect(notConfigured).toBeInTheDocument();
      const clearedKey = localStorage.getItem('keeper-openrouter-key');
      expect(clearedKey).toBeNull();
    });

    it('creates, edits, and deletes autotag rules', async () => {
      const user = userEvent.setup();
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);
      await renderApp();

      await user.click(screen.getByLabelText('Open settings'));
      await user.click(screen.getByRole('tab', { name: 'Autotag Rules' }));

      const patternInput = screen.getByLabelText('URL regex');
      const tagInput = screen.getByLabelText('Tags');
      await user.type(patternInput, 'example\\.com');
      await user.type(tagInput, 'web');
      await user.keyboard('{Enter}');
      await user.click(screen.getByText('Create Rule'));

      await screen.findByText('/example\\.com/i');
      expect(screen.getByText('web')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Edit autotag rule example\\.com'));
      await user.clear(patternInput);
      await user.type(patternInput, 'docs\\.example');
      await user.click(screen.getByLabelText('Remove rule tag web'));
      await user.type(tagInput, 'docs');
      await user.keyboard('{Enter}');
      await user.click(screen.getByText('Save Rule'));

      await screen.findByText('/docs\\.example/i');
      expect(screen.getByText('docs')).toBeInTheDocument();
      expect(screen.queryByText('/example\\.com/i')).not.toBeInTheDocument();

      await user.click(screen.getByLabelText('Delete autotag rule docs\\.example'));
      await waitFor(() => {
        expect(screen.queryByText('/docs\\.example/i')).not.toBeInTheDocument();
      });
      expect(screen.getByText('No autotag rules configured.')).toBeInTheDocument();

      window.confirm = originalConfirm;
    });

    it('suggests existing tags when editing autotag rules', async () => {
      const user = userEvent.setup();
      await renderApp();

      const noteInput = await screen.findByPlaceholderText('Take a note...');
      await user.type(noteInput, 'Tagged source note');
      await user.keyboard('{Enter}');
      await user.click(await screen.findByText('Tagged source note'));
      const noteTagInput = await screen.findByPlaceholderText('Add tag...');
      await user.type(noteTagInput, 'work');
      await user.keyboard('{Enter}');
      await user.keyboard('{Escape}');

      await user.click(screen.getByLabelText('Open settings'));
      await user.click(screen.getByRole('tab', { name: 'Autotag Rules' }));

      const tagInput = screen.getByLabelText('Tags');
      await user.type(tagInput, 'wo');

      const settingsDialog = screen.getByRole('dialog', { name: 'Settings' });
      const suggestion = await within(settingsDialog).findByRole('option', { name: 'work' });
      await user.click(suggestion);

      expect(screen.getByLabelText('Remove rule tag work')).toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('toggles extension note count badges', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByLabelText('Open settings'));
      await user.click(screen.getByRole('tab', { name: 'Notes' }));

      const toggle = screen.getByRole('checkbox', { name: /Show extension note count in tab title/ });
      expect(toggle).toBeChecked();

      await user.click(toggle);
      await waitFor(() => {
        expect(toggle).not.toBeChecked();
      });
      await expect(mockDB.getAppSettings()).resolves.toMatchObject({ extensionBadgeEnabled: false });
      expect(toggle).not.toBeChecked();
    });
  });

  it('shows extension-created notes as unseen in the tab title until the tab is focused', async () => {
    await renderApp();
    await waitFor(() => {
      expect(TestEventSource.instances).toHaveLength(1);
    });

    testDocumentHasFocus = false;
    testVisibilityState = 'hidden';

    act(() => {
      TestEventSource.instances[0]?.emit('extension-note-created');
    });
    expect(document.title).toBe('(1) keeper');

    act(() => {
      TestEventSource.instances[0]?.emit('extension-note-created');
    });
    expect(document.title).toBe('(2) keeper');

    testDocumentHasFocus = true;
    testVisibilityState = 'visible';
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(document.title).toBe('keeper');
  });

  it('runs autotag rules from the toolbar and archives matching notes', async () => {
    const user = userEvent.setup();
    await mockDB.createAutoTagRule({ pattern: 'example\\.com', tagNames: ['web'] });
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Read https://example.com later');
    await user.keyboard('{Enter}');
    await screen.findByText('https://example.com');
    await user.type(input, 'Keep this visible');
    await user.keyboard('{Enter}');
    await screen.findByText('Keep this visible');

    const linkCard = getNoteCardByText('https://example.com');
    await user.keyboard('{Control>}');
    await user.click(linkCard);
    await user.keyboard('{/Control}');
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Run autotag rules'));

    await waitFor(() => {
      expect(screen.queryByText('https://example.com')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Keep this visible')).toBeInTheDocument();
    expect(screen.getByText('1 matched, 1 archived')).toBeInTheDocument();
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();

    await user.click(screen.getByText('Archive'));
    await screen.findByText('https://example.com');
    const webLabels = screen.getAllByText('web');
    expect(webLabels[0]).toBeInTheDocument();
  });

  describe('markdown list auto-continuation', () => {
    async function openModalWithBody(user: ReturnType<typeof userEvent.setup>, body: string) {
      const createInput = await screen.findByPlaceholderText('Take a note...');
      await user.type(createInput, 'opener');
      await user.keyboard('{Enter}');

      const noteCard = await screen.findByText('opener');
      await user.click(noteCard);

      const bodyInput = await screen.findByPlaceholderText('Note');
      await user.clear(bodyInput);
      await user.type(bodyInput, body);
      return bodyInput;
    }

    it('pressing Enter on a list item inserts a new bullet on the next line', async () => {
      const user = userEvent.setup();
      await renderApp();

      const bodyInput = await openModalWithBody(user, '- first item');

      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(bodyInput).toHaveValue('- first item\n- ');
      });
    });

    it('pressing Enter on an empty bullet removes the bullet', async () => {
      const user = userEvent.setup();
      await renderApp();

      const bodyInput = await openModalWithBody(user, '- item');

      await user.keyboard('{Enter}'); // creates "- item\n- "
      await user.keyboard('{Enter}'); // empty bullet → removed

      await waitFor(() => {
        expect(bodyInput).toHaveValue('- item\n');
      });
    });
  });

  it('export separator toggle switches between compact and spaced output', async () => {
    const user = userEvent.setup();
    await renderApp();

    const input = await screen.findByPlaceholderText('Take a note...');

    // Create two notes
    await user.type(input, 'Note alpha');
    await user.keyboard('{Enter}');
    await screen.findByText('Note alpha');

    await user.type(input, 'Note beta');
    await user.keyboard('{Enter}');
    await screen.findByText('Note beta');

    // Ctrl-click both to select
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Note alpha'));
    await user.click(screen.getByText('Note beta'));
    await user.keyboard('{/Control}');

    // Open export modal
    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Export'));

    // The export preview textarea should be visible
    const preview = screen.getByLabelText<HTMLTextAreaElement>('Export preview');

    // Default is Compact (single newline separator)
    const compactValue = preview.value;
    expect(compactValue).toContain('Note alpha');
    expect(compactValue).toContain('Note beta');
    // Single newline between them, not double
    expect(compactValue).not.toContain('\n\n');

    // Switch to Spaced
    const spacedRadio = screen.getByLabelText('Spaced');
    await user.click(spacedRadio);

    // Now the preview should have double newlines
    const spacedValue = preview.value;
    expect(spacedValue).toContain('\n\n');
  });

  it('truncation indicator shows [...] when note body overflows', async () => {
    // Mock ResizeObserver to invoke the callback, and mock scrollHeight > clientHeight
    const originalRO = globalThis.ResizeObserver;
    let observedCallback: (() => void) | null = null;
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        observedCallback = () => { cb([], this); };
      }
      observe() { observedCallback?.(); }
      unobserve() { /* no-op */ }
      disconnect() { /* no-op */ }
    }
    globalThis.ResizeObserver = MockResizeObserver;

    const user = userEvent.setup();
    await renderApp();

    const longBody = Array.from({ length: 50 }, (_, i) => `Line ${String(i + 1)} of a very long note`).join('\n');
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, longBody);
    await user.keyboard('{Enter}');

    await screen.findByText(/Line 1 of a very long note/);

    const noteCard = getNoteCardByText(/Line 1 of a very long note/);
    const bodyDiv = within(noteCard).getByTestId('note-card-body');

    // Verify G5 fix: body wrapper is a div (ref target), containing the markdown preview
    expect(bodyDiv.tagName).toBe('DIV');
    const bodyText = bodyDiv.firstElementChild;
    if (bodyText === null) throw new Error('Note card markdown preview not found');
    expect(bodyText.textContent).toContain('Line 1 of a very long note');

    // Simulate overflow: scrollHeight > clientHeight
    Object.defineProperty(bodyDiv, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(bodyDiv, 'clientHeight', { value: 200, configurable: true });

    // Trigger the ResizeObserver callback
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => { observedCallback?.(); });

    // The truncation indicator [...] should now appear
    const truncation = within(noteCard).getByTestId('note-card-truncation');
    expect(truncation.textContent).toBe('[...]');

    globalThis.ResizeObserver = originalRO;
  });

  it('clicking a note in archive view opens the modal', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Archive modal test');
    await user.keyboard('{Enter}');

    // Archive the note
    await screen.findByText('Archive modal test');
    const noteCard = getNoteCardByText('Archive modal test');
    await user.click(within(noteCard).getByLabelText('Archive note'));

    // Note should disappear from the default view
    await waitFor(() => {
      expect(screen.queryByText('Archive modal test')).not.toBeInTheDocument();
    });

    // Switch to Archive filter
    const archiveFilterBtn = screen.getByText('Archive');
    await user.click(archiveFilterBtn);

    // Note should appear in the archive view
    const archivedNote = await screen.findByText('Archive modal test');

    // Click to open modal
    await user.click(archivedNote);

    // Modal should open with the note content
    await screen.findByDisplayValue('Archive modal test');
  });

  describe('Chat view', () => {
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

      const keyRequired = screen.getByText('API key required');
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
  });
});
