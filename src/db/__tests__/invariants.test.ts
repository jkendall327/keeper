import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';
import * as fc from 'fast-check';

describe('CRUD Invariants (Property-Based)', () => {
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

  it('create then get returns identical note', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.option(fc.string({ maxLength: 200 })),
          body: fc.string({ maxLength: 1000 }),
        }),
        async (input) => {
          const created = await api.createNote({
            body: input.body,
            title: input.title ?? undefined,
          });
          const fetched = await api.getNote(created.id);
          expect(fetched).toEqual(created);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('delete then get returns null', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 500 }), async (body) => {
        const note = await api.createNote({ body });
        await api.deleteNote(note.id);
        const result = await api.getNote(note.id);
        expect(result).toBeNull();
      }),
      { numRuns: 50 },
    );
  });

  it('addTag is idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (tagName) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${++idCounter}`,
            now: () => '2025-01-15 12:00:00',
          });

          const note = await api.createNote({ body: 'test' });
          const first = await api.addTag(note.id, tagName);
          const second = await api.addTag(note.id, tagName);
          expect(first.tags).toEqual(second.tags);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('getAllNotes count equals number of creates minus deletes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.oneof(fc.constant('create' as const), fc.constant('delete' as const)), {
          minLength: 1,
          maxLength: 20,
        }),
        async (ops) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${++idCounter}`,
            now: () => '2025-01-15 12:00:00',
          });

          const ids: string[] = [];
          for (const op of ops) {
            if (op === 'create') {
              const n = await api.createNote({ body: 'x' });
              ids.push(n.id);
            } else if (ids.length > 0) {
              await api.deleteNote(ids.pop()!);
            }
          }
          const all = await api.getAllNotes();
          expect(all.length).toBe(ids.length);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('update preserves fields not specified', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          initialTitle: fc.string({ maxLength: 100 }),
          initialBody: fc.string({ maxLength: 500 }),
          updateBody: fc.option(fc.string({ maxLength: 500 })),
          updateTitle: fc.option(fc.string({ maxLength: 100 })),
        }),
        async ({ initialTitle, initialBody, updateBody, updateTitle }) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${++idCounter}`,
            now: () => '2025-01-15 12:00:00',
          });

          const note = await api.createNote({ title: initialTitle, body: initialBody });
          const updated = await api.updateNote({
            id: note.id,
            title: updateTitle ?? undefined,
            body: updateBody ?? undefined,
          });

          // If we didn't update title, it should be preserved
          if (updateTitle === null) {
            expect(updated.title).toBe(initialTitle);
          }
          // If we didn't update body, it should be preserved
          if (updateBody === null) {
            expect(updated.body).toBe(initialBody);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('tags are preserved across note updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
        fc.string({ maxLength: 200 }),
        async (tags, newBody) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${++idCounter}`,
            now: () => '2025-01-15 12:00:00',
          });

          const note = await api.createNote({ body: 'initial' });
          for (const tag of tags) {
            await api.addTag(note.id, tag);
          }

          const beforeUpdate = await api.getNote(note.id);
          await api.updateNote({ id: note.id, body: newBody });
          const afterUpdate = await api.getNote(note.id);

          expect(afterUpdate?.tags).toEqual(beforeUpdate?.tags);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('renaming a tag updates all notes with that tag', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        async (noteCount, oldName, newName) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${++idCounter}`,
            now: () => '2025-01-15 12:00:00',
          });

          const notes: string[] = [];
          for (let i = 0; i < noteCount; i++) {
            const n = await api.createNote({ body: `note ${i}` });
            await api.addTag(n.id, oldName);
            notes.push(n.id);
          }

          await api.renameTag(oldName, newName);

          for (const noteId of notes) {
            const note = await api.getNote(noteId);
            expect(note?.tags.some((t) => t.name === newName)).toBe(true);
            expect(note?.tags.some((t) => t.name === oldName)).toBe(false);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it('removeTag only affects the specified note', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }),
        async (tagName) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${++idCounter}`,
            now: () => '2025-01-15 12:00:00',
          });

          const note1 = await api.createNote({ body: 'first' });
          const note2 = await api.createNote({ body: 'second' });
          await api.addTag(note1.id, tagName);
          await api.addTag(note2.id, tagName);

          await api.removeTag(note1.id, tagName);

          const n1 = await api.getNote(note1.id);
          const n2 = await api.getNote(note2.id);

          expect(n1?.tags.some((t) => t.name === tagName)).toBe(false);
          expect(n2?.tags.some((t) => t.name === tagName)).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });
});
