import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getNoteCardByText, getTestDB, renderApp } from './app-test-utils';

describe('note browsing polish', () => {
  it('browses in grid order, saves text and pending tags, and stops at each end', async () => {
    const user = userEvent.setup();
    const pinned = await getTestDB().createNote({ title: 'Pinned', body: 'First body' });
    await getTestDB().togglePinNote(pinned.id);
    await getTestDB().createNote({ title: 'Older', body: 'Second body' });
    await getTestDB().createNote({ title: 'Newer', body: 'Third body' });
    await renderApp();
    await user.click(await screen.findByText('Pinned'));
    expect(screen.getByRole('button', { name: 'Previous note' })).toBeDisabled();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Note'), ' edited');
    await user.type(screen.getByPlaceholderText('Add tag...'), 'pending');
    await user.click(screen.getByRole('button', { name: 'Next note' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Title')).toHaveValue('Newer'));
    expect((await getTestDB().getNote(pinned.id))?.body).toBe('First body edited');
    expect((await getTestDB().getNote(pinned.id))?.tags.map((tag) => tag.name)).toContain('pending');
    await user.click(screen.getByRole('button', { name: 'Next note' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Title')).toHaveValue('Older'));
    expect(screen.getByRole('button', { name: 'Next note' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous note' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Title')).toHaveValue('Newer'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument());
  });

  it('keeps unsaved text in the editor if navigation cannot save', async () => {
    const user = userEvent.setup();
    await getTestDB().createNote({ body: 'Destination' });
    await getTestDB().createNote({ body: 'Source' });
    await renderApp();
    await user.click(await screen.findByText('Source'));
    await user.type(screen.getByPlaceholderText('Note'), ' edited');
    const update = vi.spyOn(getTestDB(), 'updateNote').mockRejectedValueOnce(new Error('Save failed'));
    await user.click(screen.getByRole('button', { name: 'Next note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save');
    expect(screen.getByPlaceholderText('Note')).toHaveValue('Source edited');
    update.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Next note' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Note')).toHaveValue('Destination'));
  });

  it('retains pending tags when a partial save removes the note from the view', async () => {
    const user = userEvent.setup();
    await getTestDB().createNote({ body: 'Destination' });
    const source = await getTestDB().createNote({ body: 'Source' });
    await renderApp('/untagged');
    await user.click(await screen.findByText('Source'));
    await user.type(screen.getByPlaceholderText('Add tag...'), 'first{Enter}second');
    const realAddTag = getTestDB().addTag.bind(getTestDB());
    const addTag = vi.spyOn(getTestDB(), 'addTag')
      .mockImplementationOnce(realAddTag)
      .mockRejectedValueOnce(new Error('Tag save failed'));
    await user.click(screen.getByRole('button', { name: 'Next note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save');
    expect(screen.getByPlaceholderText('Note')).toHaveValue('Source');
    addTag.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Next note' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Note')).toHaveValue('Destination'));
    expect((await getTestDB().getNote(source.id))?.tags.map((tag) => tag.name)).toEqual(['first', 'second']);
  });

  it('stays within search results even when saving removes the current match', async () => {
    const user = userEvent.setup();
    await getTestDB().createNote({ title: 'Other', body: 'Unrelated' });
    await getTestDB().createNote({ title: 'Destination', body: 'Matching second' });
    await getTestDB().createNote({ title: 'Source', body: 'Matching first' });
    await renderApp('/inbox?q=Matching');
    await user.click(await screen.findByText('Source'));
    await user.clear(screen.getByPlaceholderText('Note'));
    await user.type(screen.getByPlaceholderText('Note'), 'Changed');
    const next = screen.getByRole('button', { name: 'Next note' });
    const previous = screen.getByRole('button', { name: 'Previous note' });
    await user.click(next.hasAttribute('disabled') ? previous : next);
    await waitFor(() => expect(screen.getByPlaceholderText('Title')).toHaveValue('Destination'));
    expect(screen.getByRole('button', { name: 'Next note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous note' })).toBeDisabled();
  });

  it('navigates from card tags without opening the editor and clears global search', async () => {
    const user = userEvent.setup();
    const note = await getTestDB().createNote({ title: 'Tagged', body: 'Matching note' });
    await getTestDB().addTag(note.id, 'work');
    await getTestDB().createNote({ title: 'Untagged', body: 'Matching other' });
    await renderApp('/inbox?q=Matching');
    await screen.findByText('Tagged');
    const card = getNoteCardByText('Tagged');
    await user.click(within(card).getByRole('button', { name: 'Show notes tagged work' }));
    await waitFor(() => { expect(window.location.pathname).toBe('/tag/work'); });
    expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveValue('');
    expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Untagged', { selector: 'h3' })).not.toBeInTheDocument());
  });

  it('highlights case-insensitive and accented matches without changing links or checkboxes', async () => {
    const user = userEvent.setup();
    const note = await getTestDB().createNote({
      title: 'CAFÉ plan',
      body: '- [ ] Visit [café](https://example.com/cafe)\n\nDecaf is different',
    });
    await renderApp('/inbox?q=cafe');
    await screen.findByText('CAFÉ');
    const card = document.querySelector<HTMLElement>('[data-note-id]');
    expect(card).not.toBeNull();
    if (card === null) return;
    expect(Array.from(card.querySelectorAll('mark'), (mark) => mark.textContent)).toEqual(['CAFÉ', 'café']);
    expect(within(card).getByRole('link')).toHaveAttribute('href', 'https://example.com/cafe');
    await user.click(within(card).getByRole('checkbox'));
    await waitFor(async () => { expect((await getTestDB().getNote(note.id))?.body).toContain('[x]'); });
    // Changing the query replaces the HTML; checkbox handlers must still work.
    expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search notes' }));
    await user.type(screen.getByRole('textbox', { name: 'Search notes' }), 'caf');
    await waitFor(() => { expect(document.querySelectorAll('[data-note-id] mark')).toHaveLength(2); });
    await user.click(screen.getByRole('checkbox'));
    await waitFor(async () => { expect((await getTestDB().getNote(note.id))?.body).toContain('[ ]'); });
  });
});
