import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  currentTimeZone,
  formatReminderDateTime,
  toLocalDateTimeInput,
} from '../utils/reminders.ts';
import { getSidebar, getTestDB, renderApp, TestEventSource } from './app-test-utils.tsx';

describe('App reminders', () => {
  it('adds, displays, edits, and removes a fixed-instant reminder from a note', async () => {
    const user = userEvent.setup();
    const note = await getTestDB().createNote({ body: 'Plan the launch' });
    const dueAtUtcMs = Date.now() + 3 * 60 * 60 * 1000;
    const scheduledLocal = toLocalDateTimeInput(dueAtUtcMs);
    const normalizedDueAtUtcMs = new Date(scheduledLocal).getTime();
    await renderApp();

    await user.click(await screen.findByText('Plan the launch'));
    const dialog = screen.getByRole('dialog', { name: 'Edit note' });
    await user.click(within(dialog).getByRole('button', { name: 'Add reminder' }));
    fireEvent.change(within(dialog).getByLabelText('Date and time'), {
      target: { value: scheduledLocal },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Set reminder' }));

    expect(await within(dialog).findByText(formatReminderDateTime(normalizedDueAtUtcMs))).toBeInTheDocument();
    expect((await getTestDB().getReminder(note.id))?.due_at_utc_ms).toBe(normalizedDueAtUtcMs);

    await user.click(within(dialog).getByRole('button', { name: 'Close note' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText(formatReminderDateTime(normalizedDueAtUtcMs))).toBeInTheDocument();

    await user.click(within(getSidebar()).getByRole('button', { name: 'Reminders' }));
    expect(await screen.findByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
    expect(screen.getByText('Plan the launch')).toBeInTheDocument();

    await user.click(screen.getByText('Plan the launch'));
    const reopenedDialog = screen.getByRole('dialog', { name: 'Edit note' });
    await user.click(within(reopenedDialog).getByRole('button', { name: 'Remove reminder' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
      expect(screen.getByTestId('reminders-empty-state')).toBeInTheDocument();
    });
    expect(await getTestDB().getReminder(note.id)).toBeNull();
  });

  it('highlights unread due reminders and marks them read when the view opens', async () => {
    const note = await getTestDB().createNote({ body: 'Call the dentist' });
    const dueAtUtcMs = Date.now() - 60_000;
    await getTestDB().setReminder({
      noteId: note.id,
      dueAtUtcMs,
      scheduledTimeZone: currentTimeZone(),
      scheduledLocal: toLocalDateTimeInput(dueAtUtcMs),
    });
    await getTestDB().surfaceDueReminders(Date.now());
    await renderApp();

    const sidebar = getSidebar();
    expect(await within(sidebar).findByLabelText('1 unread reminders')).toBeInTheDocument();

    await userEvent.setup().click(within(sidebar).getByRole('button', { name: /Reminders/ }));
    expect(await screen.findByText('Call the dentist')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(sidebar).queryByLabelText('1 unread reminders')).not.toBeInTheDocument();
    });
    expect((await getTestDB().getReminder(note.id))?.acknowledged_at_utc_ms).not.toBeNull();
  });

  it('highlights substring and phrase matches in reminder search', async () => {
    const note = await getTestDB().createNote({
      title: 'Seafood dinner',
      body: 'İ: Buy SEAFOOD and lemons; food for tomorrow.',
    });
    const dueAtUtcMs = Date.now() + 60_000;
    await getTestDB().setReminder({
      noteId: note.id,
      dueAtUtcMs,
      scheduledTimeZone: currentTimeZone(),
      scheduledLocal: toLocalDateTimeInput(dueAtUtcMs),
    });
    await renderApp('/reminders?q=food');
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('[data-note-id] mark'), (mark) => mark.textContent))
        .toEqual(['food', 'FOOD', 'food']);
    });
    const user = userEvent.setup();
    await user.clear(screen.getByRole('textbox', { name: 'Search notes' }));
    await user.type(screen.getByRole('textbox', { name: 'Search notes' }), 'food and');
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('[data-note-id] mark'), (mark) => mark.textContent))
        .toEqual(['FOOD and']);
    });
  });

  it('refreshes reminder state when the event stream reconnects', async () => {
    const note = await getTestDB().createNote({ body: 'Reconnect reminder' });
    await renderApp();
    await waitFor(() => { expect(TestEventSource.instances).toHaveLength(1); });

    const dueAtUtcMs = Date.now() - 60_000;
    await getTestDB().setReminder({
      noteId: note.id,
      dueAtUtcMs,
      scheduledTimeZone: currentTimeZone(),
      scheduledLocal: toLocalDateTimeInput(dueAtUtcMs),
    });
    await getTestDB().surfaceDueReminders(Date.now());
    expect(within(getSidebar()).queryByLabelText('1 unread reminders')).not.toBeInTheDocument();

    act(() => { TestEventSource.instances[0]?.emit('open'); });

    expect(await within(getSidebar()).findByLabelText('1 unread reminders')).toBeInTheDocument();
  });
});
