import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMockDB } from './mock-db';
import type { MockDB } from './mock-db';

// Mock the db-client module before importing App
const mockDB: MockDB = createMockDB();

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

describe('App Integration Tests', () => {
  beforeEach(() => {
    mockDB.reset();
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

  it('deletes a note', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Delete me');
    await user.keyboard('{Enter}');

    const noteText = await screen.findByText('Delete me');
    const noteCard = noteText.closest('.note-card');
    if (noteCard === null) throw new Error('Note card not found');

    // Click delete button
    const deleteBtn = noteCard.querySelector<HTMLButtonElement>('[aria-label="Delete note"]');
    if (deleteBtn === null) throw new Error('Delete button not found');
    await user.click(deleteBtn);

    // Verify deleted
    await waitFor(() => {
      expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
    });
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
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop === null) throw new Error('Backdrop not found');
    await user.click(backdrop);

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

  it('Icon component renders material-symbols-outlined span', async () => {
    await renderApp();

    // The preview toggle button in the header should contain a Material Symbol icon
    const previewToggle = screen.getByTitle('Switch to preview mode');
    const iconSpan = previewToggle.querySelector('.material-symbols-outlined');
    if (iconSpan === null) throw new Error('Material Symbol icon not found in preview toggle');
    expect(iconSpan).toBeInTheDocument();
    expect(iconSpan.textContent).toBe('visibility');
  });

  it('note card action buttons use Material Symbol icons', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Icon test');
    await user.keyboard('{Enter}');

    const noteText = await screen.findByText('Icon test');
    const noteCard = noteText.closest('.note-card');
    if (noteCard === null) throw new Error('Note card not found');

    // Pin button should contain a material-symbols-outlined icon with "push_pin"
    const pinBtn = noteCard.querySelector('[aria-label="Pin note"]');
    if (pinBtn === null) throw new Error('Pin button not found');
    const pinIcon = pinBtn.querySelector('.material-symbols-outlined');
    if (pinIcon === null) throw new Error('Material Symbol icon not found in pin button');
    expect(pinIcon).toBeInTheDocument();
    expect(pinIcon.textContent).toBe('push_pin');

    // Delete button should contain "delete" icon
    const deleteBtn = noteCard.querySelector('[aria-label="Delete note"]');
    if (deleteBtn === null) throw new Error('Delete button not found');
    const deleteIcon = deleteBtn.querySelector('.material-symbols-outlined');
    if (deleteIcon === null) throw new Error('Material Symbol icon not found in delete button');
    expect(deleteIcon).toBeInTheDocument();
    expect(deleteIcon.textContent).toBe('delete');
  });

  it('pinned notes get the pinned CSS class', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Pin me');
    await user.keyboard('{Enter}');

    const noteText = await screen.findByText('Pin me');
    const noteCard = noteText.closest('.note-card');
    if (noteCard === null) throw new Error('Note card not found');

    // Initially not pinned
    expect(noteCard).not.toHaveClass('note-card-pinned');

    // Pin the note
    const pinBtn = noteCard.querySelector<HTMLButtonElement>('[aria-label="Pin note"]');
    if (pinBtn === null) throw new Error('Pin button not found');
    await user.click(pinBtn);

    // After pinning, the card should have the pinned class
    await waitFor(() => {
      const updatedCard = screen.getByText('Pin me').closest('.note-card');
      expect(updatedCard).toHaveClass('note-card-pinned');
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
    const cardA = noteA.closest('.note-card');
    if (cardA === null) throw new Error('Card A not found');
    expect(cardA).toHaveClass('note-card-selected');

    // Modal should NOT open
    expect(screen.queryByPlaceholderText('Title')).not.toBeInTheDocument();

    // Ctrl-click Note B
    const noteB = await screen.findByText('Note B');
    await user.keyboard('{Control>}');
    await user.click(noteB);
    await user.keyboard('{/Control}');

    // Both A and B should be selected
    const cardB = noteB.closest('.note-card');
    if (cardB === null) throw new Error('Card B not found');
    expect(cardA).toHaveClass('note-card-selected');
    expect(cardB).toHaveClass('note-card-selected');

    // Ctrl-click A again to deselect
    await user.keyboard('{Control>}');
    await user.click(noteA);
    await user.keyboard('{/Control}');

    // A deselected, B still selected
    await waitFor(() => {
      expect(cardA).not.toHaveClass('note-card-selected');
      expect(cardB).toHaveClass('note-card-selected');
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
      const checkCard0 = checks[0].closest('.note-card');
      const checkCard1 = checks[1].closest('.note-card');
      const checkCard2 = checks[2].closest('.note-card');
      if (checkCard0 === null) throw new Error('Check 0 not inside a note card');
      if (checkCard1 === null) throw new Error('Check 1 not inside a note card');
      if (checkCard2 === null) throw new Error('Check 2 not inside a note card');
      expect(checkCard0).toHaveClass('note-card-selected');
      expect(checkCard1).toHaveClass('note-card-selected');
      expect(checkCard2).toHaveClass('note-card-selected');
      // Verify the specific cards are the right ones
      const cardA2 = screen.getByText('Note A').closest('.note-card');
      const cardB2 = screen.getByText('Note B').closest('.note-card');
      const cardC2 = screen.getByText('Note C').closest('.note-card');
      if (cardA2 === null) throw new Error('Card A not found');
      if (cardB2 === null) throw new Error('Card B not found');
      if (cardC2 === null) throw new Error('Card C not found');
      expect(cardA2).toHaveClass('note-card-selected');
      expect(cardB2).toHaveClass('note-card-selected');
      expect(cardC2).toHaveClass('note-card-selected');
    });

    // D and E should not be selected
    const cardD = screen.getByText('Note D').closest('.note-card');
    const cardE = screen.getByText('Note E').closest('.note-card');
    if (cardD === null) throw new Error('Card D not found');
    if (cardE === null) throw new Error('Card E not found');
    expect(cardD).not.toHaveClass('note-card-selected');
    expect(cardE).not.toHaveClass('note-card-selected');
  });

  it('plain click clears selection and opens modal', async () => {
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

    const cardA = noteA.closest('.note-card');
    if (cardA === null) throw new Error('Card A not found');
    expect(cardA).toHaveClass('note-card-selected');

    // Plain click on Note B — should clear selection and open modal
    const noteB = await screen.findByText('Note B');
    await user.click(noteB);

    // Modal should open
    await screen.findByPlaceholderText('Title');

    // Selection should be cleared (no check marks visible)
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

    // Clear search
    await user.clear(searchInput);

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

    // Create a note with a URL
    await user.type(input, 'Check https://example.com for details');
    await user.keyboard('{Enter}');
    await screen.findByText('Check https://example.com for details');

    // Create a plain note
    await user.type(input, 'No links here');
    await user.keyboard('{Enter}');
    await screen.findByText('No links here');

    // Both notes visible initially
    expect(screen.getByText('Check https://example.com for details')).toBeInTheDocument();
    expect(screen.getByText('No links here')).toBeInTheDocument();

    // Click "Links" in sidebar
    const linksBtn = screen.getByText('Links');
    await user.click(linksBtn);

    // Only the URL note should be visible
    await waitFor(() => {
      expect(screen.getByText('Check https://example.com for details')).toBeInTheDocument();
      expect(screen.queryByText('No links here')).not.toBeInTheDocument();
    });
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
      const chip = document.querySelector('.note-card-tag');
      if (chip === null) throw new Error('Tag chip not found');
      const icon = chip.querySelector('.material-symbols-outlined');
      if (icon === null) throw new Error('Material icon not found in tag chip');
      expect(icon.textContent).toBe('label');
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
    const sidebar = document.querySelector('.sidebar');
    if (sidebar === null) throw new Error('Sidebar not found');
    await waitFor(() => {
      expect(sidebar.textContent).toContain('oldname');
    });
    const sidebarTag = Array.from(sidebar.querySelectorAll('.sidebar-tag-name')).find(
      (el) => el.textContent === 'oldname',
    );
    if (sidebarTag === undefined) throw new Error('Sidebar tag not found');

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
      const sidebarEl = document.querySelector('.sidebar');
      if (sidebarEl === null) throw new Error('Sidebar not found');
      const tagNames = Array.from(sidebarEl.querySelectorAll('.sidebar-tag-name')).map((el) => el.textContent);
      expect(tagNames).toContain('newname');
      expect(tagNames).not.toContain('oldname');
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
    const sidebar = document.querySelector('.sidebar');
    if (sidebar === null) throw new Error('Sidebar not found');
    await waitFor(() => {
      expect(sidebar.textContent).toContain('removeme');
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
});
