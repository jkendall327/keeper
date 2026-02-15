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
});
