import { afterEach, describe, expect, it } from 'vitest';
import type { TestApp } from './test-app.ts';
import { createTestApp } from './test-app.ts';

describe('reminder routes', () => {
  let testApp: TestApp | undefined;

  afterEach(async () => {
    await testApp?.app.close();
    await testApp?.cleanup?.();
  });

  it('creates, reads, lists, acknowledges, and deletes reminders', async () => {
    testApp = await createTestApp();
    const note = await testApp.db.createNote({ body: 'API reminder' });
    const dueAtUtcMs = Date.UTC(2030, 5, 4, 12, 30);

    const created = await testApp.app.inject({
      method: 'PUT',
      url: `/api/notes/${note.id}/reminder`,
      payload: {
        dueAtUtcMs,
        scheduledTimeZone: 'UTC',
        scheduledLocal: '2030-06-04T12:30',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ note_id: note.id, due_at_utc_ms: dueAtUtcMs });

    const fetched = await testApp.app.inject({
      method: 'GET',
      url: `/api/notes/${note.id}/reminder`,
    });
    expect(fetched.statusCode).toBe(200);

    const listed = await testApp.app.inject({ method: 'GET', url: '/api/reminders' });
    expect(listed.json()).toEqual([
      expect.objectContaining({
        note_id: note.id,
        note: expect.objectContaining({ id: note.id, body: 'API reminder' }) as unknown,
      }),
    ]);

    await testApp.db.surfaceDueReminders(dueAtUtcMs);
    const summary = await testApp.app.inject({ method: 'GET', url: '/api/reminders/summary' });
    expect(summary.json()).toEqual({ unreadCount: 1 });

    const acknowledged = await testApp.app.inject({ method: 'POST', url: '/api/reminders/acknowledge' });
    expect(acknowledged.json()).toEqual({ acknowledgedCount: 1 });

    const removed = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}/reminder`,
    });
    expect(removed.statusCode).toBe(200);
    expect(await testApp.db.getReminder(note.id)).toBeNull();
  });

  it('returns a useful client error for invalid scheduling metadata', async () => {
    testApp = await createTestApp();
    const note = await testApp.db.createNote({ body: 'Bad reminder' });

    const response = await testApp.app.inject({
      method: 'PUT',
      url: `/api/notes/${note.id}/reminder`,
      payload: {
        dueAtUtcMs: Date.UTC(2030, 0, 1),
        scheduledTimeZone: 'Not/A_Real_Zone',
        scheduledLocal: '2030-01-01T00:00',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Reminder time zone must be a valid IANA time zone' });
  });
});
