import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB, NoteId } from '../types.ts';
import * as fc from 'fast-check';

const tagNameArbitrary = fc.constantFrom('alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot');
const noteSlotArbitrary = fc.integer({ min: 0, max: 5 });

function sortIds(ids: NoteId[]): NoteId[] {
  return [...ids].sort();
}

describe('CRUD Invariants (Property-Based)', () => {
  let api: KeeperDB;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    api = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(++idCounter)}`,
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
            ...(input.title != null ? { title: input.title } : {}),
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
        expect(note.body).toBe(body);
        expect(note.id).toBeTruthy();
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
            generateId: () => `test-id-${String(++idCounter)}`,
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
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => '2025-01-15 12:00:00',
          });

          const ids: NoteId[] = [];
          for (const op of ops) {
            if (op === 'create') {
              const n = await api.createNote({ body: 'x' });
              ids.push(n.id);
            } else if (ids.length > 0) {
              const id = ids.pop();
              if (id !== undefined) {
                await api.deleteNote(id);
              }
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
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => '2025-01-15 12:00:00',
          });

          const note = await api.createNote({ title: initialTitle, body: initialBody });
          const updated = await api.updateNote({
            id: note.id,
            ...(updateTitle != null ? { title: updateTitle } : {}),
            ...(updateBody != null ? { body: updateBody } : {}),
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
            generateId: () => `test-id-${String(++idCounter)}`,
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
        fc
          .tuple(
            fc.string({ minLength: 1, maxLength: 30 }),
            fc.string({ minLength: 1, maxLength: 30 }),
          )
          .filter(([oldName, newName]) => oldName !== newName),
        async (noteCount, [oldName, newName]) => {
          // Reset DB for each run
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => '2025-01-15 12:00:00',
          });

          const notes: NoteId[] = [];
          for (let i = 0; i < noteCount; i++) {
            const n = await api.createNote({ body: `note ${String(i)}` });
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
            generateId: () => `test-id-${String(++idCounter)}`,
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

  it('active, archived, and trashed views partition notes after state-machine operations', async () => {
    interface ModelNote {
      id: NoteId;
      archived: boolean;
      pinned: boolean;
      trashed: boolean;
      deleted: boolean;
    }
    interface Model {
      notes: ModelNote[];
    }
    type ExistingNoteOp =
      | 'archive'
      | 'delete'
      | 'pin'
      | 'restore'
      | 'trash'
      | 'trashBatch'
      | 'restoreBatch';

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.record({ kind: fc.constant('create' as const) }),
            fc.record({
              kind: fc.constantFrom<ExistingNoteOp>(
                'archive',
                'delete',
                'pin',
                'restore',
                'trash',
                'trashBatch',
                'restoreBatch',
              ),
              slot: noteSlotArbitrary,
            }),
          ),
          { minLength: 1, maxLength: 35 },
        ),
        async (ops) => {
          idCounter = 0;
          let timeCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => `2025-01-15 12:00:${String(timeCounter++).padStart(2, '0')}`,
          });

          const model: Model = { notes: [] };
          const existingNotes = () => model.notes.filter((note) => !note.deleted);

          for (const op of ops) {
            if (op.kind === 'create') {
              const note = await api.createNote({ body: `body ${String(model.notes.length)}` });
              model.notes.push({
                id: note.id,
                archived: false,
                pinned: false,
                trashed: false,
                deleted: false,
              });
              continue;
            }

            const candidates = existingNotes();
            if (candidates.length === 0) continue;

            const note = candidates[op.slot % candidates.length];
            if (note === undefined) continue;

            switch (op.kind) {
              case 'archive':
                await api.archiveNotes([note.id, note.id]);
                note.archived = true;
                break;
              case 'delete':
                await api.deleteNotes([note.id, note.id]);
                note.deleted = true;
                break;
              case 'pin':
                await api.togglePinNote(note.id);
                note.pinned = !note.pinned;
                break;
              case 'restore':
                await api.restoreNote(note.id);
                note.trashed = false;
                break;
              case 'trash':
                await api.trashNote(note.id);
                note.trashed = true;
                break;
              case 'restoreBatch': {
                const batch = candidates.slice(op.slot % candidates.length, (op.slot % candidates.length) + 3);
                await api.restoreNotes(batch.map((n) => n.id));
                for (const n of batch) n.trashed = false;
                break;
              }
              case 'trashBatch': {
                const batch = candidates.slice(op.slot % candidates.length, (op.slot % candidates.length) + 3);
                await api.trashNotes(batch.map((n) => n.id));
                for (const n of batch) n.trashed = true;
                break;
              }
            }
          }

          const all = await api.getAllNotes();
          const archived = await api.getArchivedNotes();
          const trashed = await api.getTrashedNotes();
          const activeModel = existingNotes().filter((note) => !note.archived && !note.trashed);
          const archivedModel = existingNotes().filter((note) => note.archived && !note.trashed);
          const trashedModel = existingNotes().filter((note) => note.trashed);

          expect(sortIds(all.map((note) => note.id))).toEqual(sortIds(activeModel.map((note) => note.id)));
          expect(sortIds(archived.map((note) => note.id))).toEqual(sortIds(archivedModel.map((note) => note.id)));
          expect(sortIds(trashed.map((note) => note.id))).toEqual(sortIds(trashedModel.map((note) => note.id)));

          const visibleIds = new Set([...all, ...archived].map((note) => note.id));
          for (const note of trashed) {
            expect(visibleIds.has(note.id)).toBe(false);
          }
          expect(new Set([...all, ...archived, ...trashed].map((note) => note.id)).size).toBe(
            existingNotes().length,
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it('linked and untagged smart views track body and tag mutations', async () => {
    interface ModelNote {
      id: NoteId;
      hasLink: boolean;
      tags: Set<string>;
      trashed: boolean;
      deleted: boolean;
    }
    interface CreateViewOp {
      kind: 'create';
      hasLink: boolean;
    }
    interface UpdateBodyViewOp {
      kind: 'updateBody';
      slot: number;
      hasLink: boolean;
    }
    interface TagViewOp {
      kind: 'addTag' | 'removeTag';
      slot: number;
      tag: string;
    }
    interface NoteStateViewOp {
      kind: 'trash' | 'restore' | 'delete';
      slot: number;
    }
    type ViewOp = CreateViewOp | UpdateBodyViewOp | TagViewOp | NoteStateViewOp;

    const bodyFor = (hasLink: boolean, marker: string) =>
      hasLink ? `Useful link ${marker} https://example.com/${marker}` : `Plain text ${marker}`;
    const viewOpArbitrary: fc.Arbitrary<ViewOp> = fc.oneof(
      fc.record({ kind: fc.constant('create' as const), hasLink: fc.boolean() }),
      fc.record({ kind: fc.constant('updateBody' as const), slot: noteSlotArbitrary, hasLink: fc.boolean() }),
      fc.record({ kind: fc.constant('addTag' as const), slot: noteSlotArbitrary, tag: tagNameArbitrary }),
      fc.record({ kind: fc.constant('removeTag' as const), slot: noteSlotArbitrary, tag: tagNameArbitrary }),
      fc.record({ kind: fc.constant('trash' as const), slot: noteSlotArbitrary }),
      fc.record({ kind: fc.constant('restore' as const), slot: noteSlotArbitrary }),
      fc.record({ kind: fc.constant('delete' as const), slot: noteSlotArbitrary }),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(viewOpArbitrary, { minLength: 1, maxLength: 35 }),
        async (ops) => {
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => '2025-01-15 12:00:00',
          });

          const model: ModelNote[] = [];
          const existingNotes = () => model.filter((note) => !note.deleted);

          for (const [index, op] of ops.entries()) {
            if (op.kind === 'create') {
              const note = await api.createNote({ body: bodyFor(op.hasLink, `created-${String(index)}`) });
              model.push({
                id: note.id,
                hasLink: op.hasLink,
                tags: new Set(),
                trashed: false,
                deleted: false,
              });
              continue;
            }

            const candidates = existingNotes();
            if (candidates.length === 0) continue;
            const note = candidates[op.slot % candidates.length];
            if (note === undefined) continue;

            switch (op.kind) {
              case 'addTag':
                await api.addTag(note.id, op.tag);
                note.tags.add(op.tag);
                break;
              case 'delete':
                await api.deleteNote(note.id);
                note.deleted = true;
                break;
              case 'removeTag':
                await api.removeTag(note.id, op.tag);
                note.tags.delete(op.tag);
                break;
              case 'restore':
                await api.restoreNote(note.id);
                note.trashed = false;
                break;
              case 'trash':
                await api.trashNote(note.id);
                note.trashed = true;
                break;
              case 'updateBody':
                await api.updateNote({ id: note.id, body: bodyFor(op.hasLink, `updated-${String(index)}`) });
                note.hasLink = op.hasLink;
                break;
            }
          }

          const linked = await api.getLinkedNotes();
          const untagged = await api.getUntaggedNotes();
          const visibleModel = existingNotes().filter((note) => !note.trashed);

          expect(sortIds(linked.map((note) => note.id))).toEqual(
            sortIds(visibleModel.filter((note) => note.hasLink).map((note) => note.id)),
          );
          expect(sortIds(untagged.map((note) => note.id))).toEqual(
            sortIds(visibleModel.filter((note) => note.tags.size === 0).map((note) => note.id)),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it('renaming into an existing tag preserves the union without duplicate note-tag links', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            hasOld: fc.boolean(),
            hasNew: fc.boolean(),
            hasOther: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 },
        ).filter(
          (assignments) =>
            assignments.some((assignment) => assignment.hasOld) &&
            assignments.some((assignment) => assignment.hasNew),
        ),
        async (assignments) => {
          idCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => '2025-01-15 12:00:00',
          });

          const oldName = 'old-tag';
          const newName = 'new-tag';
          const otherName = 'other-tag';
          const notes: { id: NoteId; shouldHaveNew: boolean; shouldHaveOther: boolean }[] = [];

          for (const [index, assignment] of assignments.entries()) {
            const note = await api.createNote({ body: `note ${String(index)}` });
            if (assignment.hasOld) await api.addTag(note.id, oldName);
            if (assignment.hasNew) await api.addTag(note.id, newName);
            if (assignment.hasOther) await api.addTag(note.id, otherName);
            notes.push({
              id: note.id,
              shouldHaveNew: assignment.hasOld || assignment.hasNew,
              shouldHaveOther: assignment.hasOther,
            });
          }

          await api.renameTag(oldName, newName);

          for (const expected of notes) {
            const note = await api.getNote(expected.id);
            expect(note).not.toBeNull();
            const tagNames = note?.tags.map((tag) => tag.name) ?? [];
            expect(tagNames.filter((name) => name === newName)).toHaveLength(expected.shouldHaveNew ? 1 : 0);
            expect(tagNames.some((name) => name === oldName)).toBe(false);
            expect(tagNames.some((name) => name === otherName)).toBe(expected.shouldHaveOther);
          }

          const allTagNames = (await api.getAllTags()).map((tag) => tag.name);
          expect(allTagNames.some((name) => name === oldName)).toBe(false);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('auto-tag rule runs are idempotent over matching active linked notes', async () => {
    interface AutoTagFixture {
      domain: 'docs.example.com' | 'news.example.com' | 'other.example.com';
      active: boolean;
      initiallyTagged: boolean;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record<AutoTagFixture>({
            domain: fc.constantFrom('docs.example.com', 'news.example.com', 'other.example.com'),
            active: fc.boolean(),
            initiallyTagged: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (fixtures) => {
          idCounter = 0;
          let timeCounter = 0;
          api = createKeeperDB({
            db: createTestDb(),
            generateId: () => `test-id-${String(++idCounter)}`,
            now: () => `2025-01-15 12:00:${String(timeCounter++).padStart(2, '0')}`,
          });

          const notes: { id: NoteId; expectedTags: Set<string>; shouldMatch: boolean }[] = [];
          for (const [index, fixture] of fixtures.entries()) {
            const note = await api.createNote({
              body: `Read https://${fixture.domain}/article-${String(index)}`,
            });
            const expectedTags = new Set<string>();
            const shouldMatch = fixture.active && fixture.domain !== 'other.example.com';
            if (fixture.initiallyTagged) {
              await api.addTag(note.id, 'web');
              expectedTags.add('web');
            }
            if (!fixture.active) {
              await api.trashNote(note.id);
            }
            if (shouldMatch) {
              expectedTags.add('web');
              if (fixture.domain === 'docs.example.com') expectedTags.add('docs');
              if (fixture.domain === 'news.example.com') expectedTags.add('news');
            }
            notes.push({ id: note.id, expectedTags, shouldMatch });
          }

          await api.createAutoTagRule({ pattern: 'docs\\.example\\.com', tagNames: ['docs', 'web'] });
          await api.createAutoTagRule({ pattern: 'news\\.example\\.com', tagNames: ['news', 'web'] });

          const firstRun = await api.runAutoTagRules();
          const secondRun = await api.runAutoTagRules();

          expect(firstRun.matchedNoteCount).toBe(notes.filter((note) => note.shouldMatch).length);
          expect(firstRun.archivedNoteCount).toBe(firstRun.matchedNoteCount);
          expect(secondRun).toEqual({ matchedNoteCount: 0, archivedNoteCount: 0, appliedTagCount: 0 });

          for (const expected of notes) {
            const note = await api.getNote(expected.id);
            expect(note).not.toBeNull();
            expect(note?.archived).toBe(expected.shouldMatch);
            expect(new Set(note?.tags.map((tag) => tag.name))).toEqual(expected.expectedTags);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
