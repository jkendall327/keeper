import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getNoteCardByText, getTestDB, renderApp } from './app-test-utils';

describe('App notes', () => {
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

it('does not show a separate truncation indicator when note body overflows', async () => {
  const user = userEvent.setup();
  await renderApp();

  const longBody = Array.from({ length: 50 }, (_, i) => `Line ${String(i + 1)} of a very long note`).join('\n');
  const input = await screen.findByPlaceholderText('Take a note...');
  await user.type(input, longBody);
  await user.keyboard('{Enter}');

  await screen.findByText(/Line 1 of a very long note/);

  const noteCard = getNoteCardByText(/Line 1 of a very long note/);
  const bodyDiv = within(noteCard).getByTestId('note-card-body');

  // Body wrapper remains a div containing the markdown preview.
  expect(bodyDiv.tagName).toBe('DIV');
  const bodyText = bodyDiv.firstElementChild;
  if (bodyText === null) throw new Error('Note card markdown preview not found');
  expect(bodyText.textContent).toContain('Line 1 of a very long note');
  expect(within(noteCard).queryByTestId('note-card-truncation')).not.toBeInTheDocument();
});

it('shows body content alongside a found link preview image in note cards', async () => {
  const db = getTestDB();
  const url = 'https://example.com/article';
  await db.createNote({ body: url });
  await db.upsertLinkPreview({
    url,
    image_url: 'https://example.com/preview.jpg',
    status: 'found',
  });

  await renderApp();

  const noteCard = await screen.findByText(url);
  const card = noteCard.closest<HTMLElement>('[data-note-id][role="button"]');
  if (card === null) throw new Error('Note card not found');

  const bodyDiv = within(card).getByTestId('note-card-body');
  expect(within(bodyDiv).getByRole('img', { name: 'Link preview image' })).toHaveAttribute('src', 'https://example.com/preview.jpg');
  expect(within(bodyDiv).getByRole('link', { name: url })).toHaveAttribute('href', url);
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
});
