import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getSidebar, getSidebarTagButton, getTestDB, renderApp } from './app-test-utils';

describe('App sidebar filters and tag management', () => {
it('searches only trashed notes while the Trash view is active', async () => {
  const user = userEvent.setup();
  const db = getTestDB();
  await db.createNote({ body: 'Shared search term in inbox' });
  const trashed = await db.createNote({ body: 'Shared search term in trash' });
  await db.trashNote(trashed.id);
  await renderApp('/trash');

  const searchInput = await screen.findByPlaceholderText(/Search notes/);
  await user.type(searchInput, 'Shared search term');

  expect(await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === 'Shared search term in trash')).toBeInTheDocument();
  expect(screen.queryByText('Shared search term in inbox')).not.toBeInTheDocument();
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

it('Duplicates sidebar filter shows notes with matching bodies', async () => {
  const user = userEvent.setup();
  const db = getTestDB();
  await db.createNote({ body: 'same body' });
  await db.createNote({ body: 'different body' });
  await db.createNote({ body: 'same body' });
  await renderApp();

  await user.click(screen.getByText('Duplicates'));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/duplicates');
    expect(screen.getAllByText('same body')).toHaveLength(2);
    expect(screen.queryByText('different body')).not.toBeInTheDocument();
  });
});

it('deduplicates all groups from the header and refreshes the view', async () => {
  const user = userEvent.setup();
  const db = getTestDB();
  await db.createNote({ body: 'same body', initialTagNames: ['one'] });
  await db.createNote({ body: 'same body', initialTagNames: ['two'] });
  await renderApp('/duplicates');
  await user.click(await screen.findByRole('button', { name: 'Deduplicate all notes' }));
  expect(await screen.findByText('Moved 1 duplicate to Trash.')).toBeInTheDocument();
  expect(screen.queryByText('same body')).not.toBeInTheDocument();
  expect(await db.getTrashedNotes()).toHaveLength(1);
  const survivors = await db.getAllNotes();
  expect(survivors).toHaveLength(1);
  expect(survivors[0]?.tags.map((tag) => tag.name).sort()).toEqual(['one', 'two']);
  await user.click(screen.getByRole('button', { name: 'Deduplicate all notes' }));
  expect(await screen.findByText('No duplicates found.')).toBeInTheDocument();
});

it('reports deduplication failure without removing notes', async () => {
  const user = userEvent.setup();
  const db = getTestDB();
  await db.createNote({ body: 'same body' });
  await db.createNote({ body: 'same body' });
  vi.spyOn(db, 'deduplicateNotes').mockRejectedValue(new Error('test failure'));
  await renderApp('/duplicates');
  await user.click(await screen.findByRole('button', { name: 'Deduplicate all notes' }));
  expect(await screen.findByText('Could not deduplicate notes. Please try again.')).toBeInTheDocument();
  expect(screen.getAllByText('same body')).toHaveLength(2);
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
    expect(window.location.pathname).toBe('/tag/work');
    expect(screen.getByText('Tagged work note')).toBeInTheDocument();
    expect(screen.queryByText('Plain untagged note')).not.toBeInTheDocument();
  });
});

it('opens filter and search state from the URL', async () => {
  const db = getTestDB();
  const tagged = await db.createNote({ body: 'Deep linked work note' });
  await db.addTag(tagged.id, 'deep');
  await db.createNote({ body: 'Plain unlinked note' });

  await renderApp('/tag/deep?q=work');

  expect(await screen.findByDisplayValue('work')).toBeInTheDocument();
  expect(await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === 'Deep linked work note')).toBeInTheDocument();
  expect(screen.queryByText('Plain unlinked note')).not.toBeInTheDocument();
});

it('encodes tag names in the URL path', async () => {
  const user = userEvent.setup();
  const db = getTestDB();
  await db.createNote({ body: 'Vacation packing list', initialTagNames: ['summer vacation'] });
  await renderApp();

  await user.click(await waitFor(() => getSidebarTagButton('summer vacation')));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/tag/summer%20vacation');
    expect(screen.getByText('Vacation packing list')).toBeInTheDocument();
  });
});

describe('mobile sidebar gestures', () => {
  async function setupSwipe() {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 768px)', media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    await renderApp();
    const target = await screen.findByLabelText('Toggle sidebar');
    vi.spyOn(getSidebar(), 'getBoundingClientRect').mockReturnValue({ width: 240 } as DOMRect);
    // happy-dom does not implement native pointer capture or layout.
    const app = target.closest('header')?.parentElement;
    if (app === null || app === undefined) throw new Error('Missing app');
    app.setPointerCapture = vi.fn();
    app.hasPointerCapture = () => false;
    const point = (x: number, y = 200, pointerId = 1) => ({
      clientX: x, clientY: y, pointerId, pointerType: 'touch', isPrimary: true,
    });
    return { target, point, app };
  }

  it('tracks a swipe from the left quarter and opens on release, then swipes shut from a sidebar button', async () => {
    const { target, point, app } = await setupSwipe();
    fireEvent.pointerDown(target, point(90));
    fireEvent.pointerMove(target, point(160));
    expect(app.style.getPropertyValue('--sidebar-drag-offset')).toBe('-170px');
    fireEvent.lostPointerCapture(target, point(160));
    expect(app.style.getPropertyValue('--sidebar-drag-offset')).toBe('-170px');
    fireEvent.pointerUp(target, point(160));
    expect(screen.getByLabelText('Close sidebar')).toBeInTheDocument();
    const inbox = within(getSidebar()).getByRole('button', { name: /Inbox/ });
    fireEvent.pointerDown(inbox, point(180));
    fireEvent.pointerMove(inbox, point(100));
    expect(app.style.getPropertyValue('--sidebar-drag-offset')).toBe('-80px');
    fireEvent.pointerUp(inbox, point(100));
    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
    fireEvent.click(target, { detail: 1 });
    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
  });

  it('accepts a fresh tap immediately after a swipe while suppressing the swipe click', async () => {
    const { target, point } = await setupSwipe();
    fireEvent.pointerDown(target, point(60));
    fireEvent.pointerMove(target, point(140));
    fireEvent.pointerUp(target, point(140));
    fireEvent.click(target, { detail: 1 });
    expect(screen.getByLabelText('Close sidebar')).toBeInTheDocument();

    const settings = screen.getByLabelText('Open settings');
    fireEvent.pointerDown(settings, point(100));
    fireEvent.pointerUp(settings, point(100));
    fireEvent.click(settings, { detail: 1 });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('leaves vertical scrolling alone even when it later moves sideways', async () => {
    const { target, point } = await setupSwipe();
    fireEvent.pointerDown(target, point(60));
    fireEvent.pointerMove(target, point(64, 225));
    fireEvent.pointerMove(target, point(180, 230));
    fireEvent.pointerUp(target, point(180, 230));
    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
  });

  it('ignores swipes outside the starting area and inside text fields', async () => {
    const { target, point } = await setupSwipe();
    for (const [element, x] of [[target, 150], [screen.getByPlaceholderText(/Search notes/), 30]] as const) {
      fireEvent.pointerDown(element, point(x));
      fireEvent.pointerMove(element, point(x + 100));
      fireEvent.pointerUp(element, point(x + 100));
      expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
    }
  });

  it('reverts cancelled drags and short pulls without toggling', async () => {
    const { target, point } = await setupSwipe();
    fireEvent.pointerDown(target, point(60));
    fireEvent.pointerMove(target, point(140));
    fireEvent.pointerCancel(target, point(140));
    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
    fireEvent.pointerDown(target, point(60));
    fireEvent.pointerMove(target, point(75));
    fireEvent.pointerUp(target, point(75));
    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
    fireEvent.pointerDown(target, point(60));
    fireEvent.pointerMove(target, point(140));
    fireEvent.pointerDown(target, { ...point(160, 200, 2), isPrimary: false });
    fireEvent.pointerUp(target, point(140));
    expect(screen.queryByLabelText('Close sidebar')).not.toBeInTheDocument();
  });
});

it('updates browser history when switching filters', async () => {
  const user = userEvent.setup();
  await renderApp();

  await user.click(screen.getByText('Links'));
  await waitFor(() => {
    expect(window.location.pathname).toBe('/links');
  });

  window.history.back();
  await waitFor(() => {
    expect(window.location.pathname).toBe('/inbox');
  });
});

it('redirects missing tag routes back to inbox', async () => {
  await renderApp('/tag/missing-tag');

  await waitFor(() => {
    expect(window.location.pathname).toBe('/inbox');
  });
});

it('redirects unmatched tag names back to inbox', async () => {
  await renderApp('/tag/not-a-number');

  await waitFor(() => {
    expect(window.location.pathname).toBe('/inbox');
  });
});

it('redirects unknown routes back to inbox', async () => {
  await renderApp('/definitely-not-a-keeper-route');

  await waitFor(() => {
    expect(window.location.pathname).toBe('/inbox');
  });
});

it('archives tagged notes from the cleanup button', async () => {
  const user = userEvent.setup();
  await renderApp();

  const cleanupButton = await screen.findByRole('button', { name: 'Clean up notes' });
  expect(cleanupButton).toBeEnabled();

  const input = await screen.findByPlaceholderText('Take a note...');
  await user.type(input, 'Tagged inbox note');
  await user.keyboard('{Enter}');
  await user.type(input, 'Plain inbox note');
  await user.keyboard('{Enter}');
  await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === 'Plain inbox note');

  await user.click(await screen.findByText('Tagged inbox note'));
  const tagInput = await screen.findByPlaceholderText('Add tag...');
  await user.type(tagInput, 'work');
  await user.keyboard('{Enter}');
  await screen.findByLabelText('Remove tag work');
  await user.keyboard('{Escape}');

  const workTag = await waitFor(() => getSidebarTagButton('work'));

  await user.click(workTag);
  expect(screen.getByRole('button', { name: 'Clean up notes' })).toBeInTheDocument();

  await user.click(screen.getByText('Inbox'));
  const searchInput = screen.getByPlaceholderText(/Search notes/);
  await user.type(searchInput, 'Plain');
  expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Plain inbox note')).toBeInTheDocument();
  expect(screen.queryByText('Tagged inbox note')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Clean up notes' }));
  await user.clear(searchInput);

  await waitFor(() => {
    expect(screen.queryByText('Tagged inbox note')).not.toBeInTheDocument();
  });
  expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Plain inbox note')).toBeInTheDocument();
  expect(screen.getByText('0 matched, 1 archived')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /^Archive$/ }));
  await screen.findByText('Tagged inbox note');
  expect(screen.getByRole('button', { name: 'Clean up notes' })).toBeInTheDocument();
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

it('commits unsaved note text before removing the active tag from an open note', async () => {
  const user = userEvent.setup();
  const db = getTestDB();
  const note = await db.createNote({ body: 'Original tagged body', initialTagNames: ['foo'] });

  await renderApp('/tag/foo');

  await user.click(await screen.findByText('Original tagged body'));
  const bodyInput = await screen.findByPlaceholderText('Note');
  await user.clear(bodyInput);
  await user.type(bodyInput, 'Edited before tag removal');

  await user.click(await screen.findByLabelText('Remove tag foo'));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
  });

  await expect(db.getNote(note.id)).resolves.toMatchObject({
    body: 'Edited before tag removal',
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
  const allNotes = await getTestDB().getAllNotes();
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
  const allNotes = await getTestDB().getAllNotes();
  const created = allNotes.find((note) => note.body === 'Loose kitten thought');
  expect(created?.tags).toEqual([]);
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
});
