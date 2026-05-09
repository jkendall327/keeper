import { describe, it, expect } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getNoteCardByText, getTestDB, renderApp } from './app-test-utils';

describe('App search, keyboard shortcuts, and empty states', () => {
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

it('does not autofocus quick add on inbox load when disabled in settings', async () => {
  await getTestDB().updateAppSettings({ quickAddAutofocusEnabled: false });
  await renderApp();

  const quickAdd = await screen.findByPlaceholderText('Take a note...');
  expect(document.activeElement).not.toBe(quickAdd);
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
});
