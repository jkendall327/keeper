import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Smoke test', () => {
  let api: KeeperDB;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    api = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${++idCounter}`,
      now: () => '2025-01-15 12:00:00',
    });
  });

  it('can create and retrieve a note', async () => {
    const created = await api.createNote({ body: 'Hello, world!' });
    expect(created.body).toBe('Hello, world!');
    expect(created.id).toBe('test-id-1');
    expect(created.created_at).toBe('2025-01-15 12:00:00');
    expect(created.tags).toEqual([]);

    const retrieved = await api.getNote(created.id);
    expect(retrieved).toEqual(created);
  });
});
