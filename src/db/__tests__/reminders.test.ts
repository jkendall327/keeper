import { beforeEach, describe, expect, it } from 'vitest';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';
import { createTestDb } from './test-db.ts';

describe('reminders', () => {
  let api: KeeperDB;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    api = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(++idCounter)}`,
      now: () => '2026-09-02 12:00:00.000',
    });
  });

  it('stores one fixed instant per note and replaces it without duplicating the reminder', async () => {
    const note = await api.createNote({ body: 'Remember this' });
    const firstDue = Date.UTC(2030, 0, 2, 10, 15);
    const secondDue = Date.UTC(2030, 0, 3, 11, 45);

    const first = await api.setReminder({
      noteId: note.id,
      dueAtUtcMs: firstDue,
      scheduledTimeZone: 'UTC',
      scheduledLocal: '2030-01-02T10:15',
    });
    const replaced = await api.setReminder({
      noteId: note.id,
      dueAtUtcMs: secondDue,
      scheduledTimeZone: 'UTC',
      scheduledLocal: '2030-01-03T11:45',
    });

    expect(replaced).toMatchObject({
      id: first.id,
      note_id: note.id,
      due_at_utc_ms: secondDue,
      scheduled_time_zone: 'UTC',
      scheduled_local: '2030-01-03T11:45',
      surfaced_at_utc_ms: null,
      acknowledged_at_utc_ms: null,
    });
    expect(await api.getReminders()).toHaveLength(1);
  });

  it('surfaces due reminders exactly once and keeps unread state durable until acknowledged', async () => {
    const note = await api.createNote({ body: 'Due note' });
    await api.setReminder({
      noteId: note.id,
      dueAtUtcMs: 10_000,
      scheduledTimeZone: 'UTC',
      scheduledLocal: '1970-01-01T00:00',
    });

    expect(await api.getNextReminderDueAt()).toBe(10_000);
    expect(await api.surfaceDueReminders(9_999)).toBe(0);
    expect(await api.surfaceDueReminders(10_000)).toBe(1);
    expect(await api.surfaceDueReminders(10_001)).toBe(0);
    expect(await api.getNextReminderDueAt()).toBeNull();
    expect(await api.getReminderSummary()).toEqual({ unreadCount: 1 });
    expect((await api.getReminder(note.id))?.surfaced_at_utc_ms).toBe(10_000);

    expect(await api.acknowledgeDueReminders(10_002)).toBe(1);
    expect(await api.acknowledgeDueReminders(10_003)).toBe(0);
    expect(await api.getReminderSummary()).toEqual({ unreadCount: 0 });
    expect((await api.getReminder(note.id))?.acknowledged_at_utc_ms).toBe(10_002);
  });

  it('does not surface trashed notes, but catches them up after restoration', async () => {
    const note = await api.createNote({ body: 'Temporarily deleted' });
    await api.setReminder({
      noteId: note.id,
      dueAtUtcMs: 60_000,
      scheduledTimeZone: 'UTC',
      scheduledLocal: '1970-01-01T00:01',
    });

    await api.trashNote(note.id);
    expect(await api.getNextReminderDueAt()).toBeNull();
    expect(await api.surfaceDueReminders(60_000)).toBe(0);
    expect(await api.getReminders()).toEqual([]);

    await api.restoreNote(note.id);
    expect(await api.surfaceDueReminders(60_000)).toBe(1);
    expect(await api.getReminderSummary()).toEqual({ unreadCount: 1 });
  });

  it('cascades reminder deletion with its note', async () => {
    const note = await api.createNote({ body: 'Disposable' });
    await api.setReminder({
      noteId: note.id,
      dueAtUtcMs: Date.UTC(2030, 0, 1),
      scheduledTimeZone: 'UTC',
      scheduledLocal: '2030-01-01T00:00',
    });

    await api.deleteNote(note.id);

    expect(await api.getReminder(note.id)).toBeNull();
  });

  it('rejects nonexistent daylight-saving wall times', async () => {
    const note = await api.createNote({ body: 'DST gap' });

    await expect(Promise.resolve().then(() => api.setReminder({
      noteId: note.id,
      dueAtUtcMs: Date.UTC(2026, 2, 8, 10, 30),
      scheduledTimeZone: 'America/Los_Angeles',
      scheduledLocal: '2026-03-08T02:30',
    }))).rejects.toThrow('does not exist');
  });
});
