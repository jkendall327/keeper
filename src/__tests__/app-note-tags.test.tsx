import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getNoteCardByText, mockDB, renderApp } from './app-test-utils';

describe('App note tags', () => {
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
});
