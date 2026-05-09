import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getNoteCardByText, getTestDB, renderApp } from './app-test-utils';

describe('App selection, export, and toolbar actions', () => {
it('ctrl-drag rectangle selection adds to the existing selected notes', async () => {
  const user = userEvent.setup();
  await renderApp();

  const input = await screen.findByPlaceholderText('Take a note...');
  for (const text of ['Note A', 'Note B', 'Note C']) {
    await user.type(input, text);
    await user.keyboard('{Enter}');
    await screen.findByText(text);
  }

  await user.keyboard('{Control>}');
  await user.click(screen.getByText('Note A'));
  await user.keyboard('{/Control}');
  expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'true');

  const cardA = getNoteCardByText('Note A');
  const cardB = getNoteCardByText('Note B');
  const cardC = getNoteCardByText('Note C');
  const wrapper = cardA.parentElement?.parentElement;
  if (wrapper === null || wrapper === undefined) throw new Error('Note grid wrapper not found');

  setElementRect(wrapper, { left: 0, top: 0, right: 500, bottom: 500 });
  setElementRect(cardA, { left: 10, top: 10, right: 110, bottom: 60 });
  setElementRect(cardB, { left: 10, top: 80, right: 110, bottom: 130 });
  setElementRect(cardC, { left: 10, top: 150, right: 110, bottom: 200 });

  fireEvent.mouseDown(wrapper, { button: 0, clientX: 0, clientY: 70, ctrlKey: true });
  fireEvent.mouseMove(document, { clientX: 120, clientY: 210, ctrlKey: true });
  fireEvent.mouseUp(document);

  await waitFor(() => {
    expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'true');
    expect(getNoteCardByText('Note B')).toHaveAttribute('aria-pressed', 'true');
    expect(getNoteCardByText('Note C')).toHaveAttribute('aria-pressed', 'true');
  });
});

it('starts rectangle selection from the quick-add band above the note grid', async () => {
  const user = userEvent.setup();
  await renderApp();

  const input = await screen.findByPlaceholderText('Take a note...');
  for (const text of ['Note A', 'Note B']) {
    await user.type(input, text);
    await user.keyboard('{Enter}');
    await screen.findByText(text);
  }

  const cardA = getNoteCardByText('Note A');
  const cardB = getNoteCardByText('Note B');
  const wrapper = cardA.parentElement?.parentElement;
  if (wrapper === null || wrapper === undefined) throw new Error('Note grid wrapper not found');

  setElementRect(wrapper, { left: 0, top: 0, right: 500, bottom: 500 });
  setElementRect(cardA, { left: 10, top: 120, right: 110, bottom: 170 });
  setElementRect(cardB, { left: 10, top: 190, right: 110, bottom: 240 });

  fireEvent.mouseDown(wrapper, { button: 0, clientX: 250, clientY: 70 });
  fireEvent.mouseMove(document, { clientX: 0, clientY: 260 });
  fireEvent.mouseUp(document);

  await waitFor(() => {
    expect(getNoteCardByText('Note A')).toHaveAttribute('aria-pressed', 'true');
    expect(getNoteCardByText('Note B')).toHaveAttribute('aria-pressed', 'true');
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

it('runs autotag rules from the toolbar and archives matching notes', async () => {
  const user = userEvent.setup();
  await getTestDB().createAutoTagRule({ pattern: 'example\\.com', tagNames: ['web'] });
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
});

function setElementRect(element: Element, rect: { left: number; top: number; right: number; bottom: number }) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  element.getBoundingClientRect = () => ({
    ...rect,
    width,
    height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}
