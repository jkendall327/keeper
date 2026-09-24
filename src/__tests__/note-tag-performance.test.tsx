import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '../db/db-client.ts';
import { toNoteId, type NoteWithTags } from '../db/types.ts';
import { KeeperServicesContext } from '../services.ts';
import { keeperKeys, useInboxNotes, useNoteMutations, useTags } from '../hooks/useKeeperQuery.ts';
import { patchCachedNoteTags } from '../hooks/note-tag-cache.ts';
import { getTestApiFetch, getTestDB } from './app-test-utils.tsx';

describe('label updates', () => {
  it('updates single and bulk labels without fetching the inbox again', async () => {
    const db = getTestDB();
    const first = await db.createNote({ body: 'First' });
    const second = await db.createNote({ body: 'Second' });
    const untouched = await db.createNote({ body: 'Untouched' });
    const list = vi.spyOn(db, 'getAllNotes');
    const apiFetch = getTestApiFetch();
    const services = { client: createHttpClient(apiFetch), apiFetch };
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queries}>
        <KeeperServicesContext.Provider value={services}>{children}</KeeperServicesContext.Provider>
      </QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => ({
      notes: useInboxNotes().data,
      tags: useTags().data,
      mutations: useNoteMutations(),
    }), { wrapper });
    await waitFor(() => { expect(result.current.notes).toHaveLength(3); });
    const initialCalls = list.mock.calls.length;
    const originalUntouched = result.current.notes.find((note) => note.id === untouched.id);

    await act(() => result.current.mutations.addTag(first.id, 'one'));
    await waitFor(() => {
      expect(result.current.notes.find((note) => note.id === first.id)?.tags.map((tag) => tag.name)).toEqual(['one']);
    });
    await act(() => result.current.mutations.addTagToNotes([first.id, second.id], 'bulk'));
    await waitFor(() => {
      expect(result.current.notes.find((note) => note.id === second.id)?.tags.map((tag) => tag.name)).toEqual(['bulk']);
      expect(result.current.tags.map((tag) => tag.name)).toContain('bulk');
    });
    await act(() => result.current.mutations.removeTag(first.id, 'one'));
    await act(() => result.current.mutations.removeTagFromNotes([first.id, second.id], 'bulk'));

    await waitFor(() => { expect(result.current.notes.every((note) => note.tags.length === 0)).toBe(true); });
    expect(result.current.notes.find((note) => note.id === untouched.id)).toBe(originalUntouched);
    // Rapid writes must finish in order even though bulk additions fetch labels.
    await act(async () => {
      await Promise.all([
        result.current.mutations.addTagToNotes([first.id, second.id], 'rapid'),
        result.current.mutations.removeTagFromNotes([first.id, second.id], 'rapid'),
      ]);
    });
    await waitFor(() => { expect(result.current.notes.every((note) => note.tags.length === 0)).toBe(true); });
    expect((await db.getAllNotes()).every((note) => note.tags.length === 0)).toBe(true);
    // Exclude the explicit database verification above from the request count.
    expect(list).toHaveBeenCalledTimes(initialCalls + 1);
    unmount();
    queries.clear();
  });

  it('restarts an interrupted refresh so an unrelated new note is not lost', async () => {
    const db = getTestDB();
    const note = await db.createNote({ body: 'Original' });
    const queries = new QueryClient();
    let completeOldResponse: (notes: NoteWithTags[]) => void = () => { throw new Error('No pending response'); };
    let requests = 0;
    const observer = new QueryObserver(queries, {
      queryKey: keeperKeys.inbox,
      initialData: [note],
      staleTime: Infinity,
      queryFn: () => {
        requests++;
        if (requests === 1) return new Promise<NoteWithTags[]>((resolve) => { completeOldResponse = resolve; });
        return db.getAllNotes();
      },
    });
    const unsubscribe = observer.subscribe(() => { /* Keep the query active during the refresh. */ });
    const pending = observer.refetch();
    const added = await db.createNote({ body: 'Created during refresh' });
    const updated = await db.addTag(note.id, 'new');
    const tag = updated.tags[0];
    if (tag === undefined) throw new Error('Expected new label');
    await patchCachedNoteTags(queries, [note.id], { add: tag });
    completeOldResponse([note]);
    await pending;
    expect(requests).toBe(2);
    const cached = queries.getQueryData<NoteWithTags[]>(keeperKeys.inbox);
    expect(cached?.map((entry) => entry.id)).toContain(added.id);
    expect(cached?.find((entry) => entry.id === note.id)?.tags).toEqual([tag]);
    unsubscribe();
    queries.clear();
  });

  it('patches stable collections and details without losing search rank or other fields', async () => {
    const queries = new QueryClient();
    const note = await getTestDB().createNote({ body: 'Keep this body' });
    for (const key of [keeperKeys.inbox, keeperKeys.view('archive'), keeperKeys.view('trash'), keeperKeys.view('links'), keeperKeys.view('duplicates')]) {
      queries.setQueryData(key, [note]);
    }
    queries.setQueryData(keeperKeys.search('body'), [{ ...note, rank: -2 }]);
    queries.setQueryData(keeperKeys.note(note.id), note);
    queries.setQueryData(keeperKeys.view('untagged'), [note]);
    queries.setQueryData(keeperKeys.view('tag:1'), []);
    await queries.invalidateQueries({ queryKey: keeperKeys.view('archive') });
    await patchCachedNoteTags(queries, [note.id], { add: { id: 1, name: 'label', icon: null } });
    expect(queries.getQueryData(keeperKeys.search('body'))).toMatchObject([{ body: note.body, rank: -2, tags: [{ name: 'label' }] }]);
    expect(queries.getQueryData(keeperKeys.note(note.id))).toMatchObject({ tags: [{ name: 'label' }] });
    expect(queries.getQueryData(keeperKeys.view('untagged'))).toEqual([note]);
    expect(queries.getQueryData(keeperKeys.view('tag:1'))).toEqual([]);
    expect(queries.getQueryState(keeperKeys.view('archive'))?.isInvalidated).toBe(true);
    queries.clear();
  });

  it('refreshes label and untagged membership after adding and removing labels', async () => {
    const db = getTestDB();
    const source = await db.createNote({ body: 'Already labeled' });
    const target = await db.createNote({ body: 'Membership changes' });
    const labeled = await db.addTag(source.id, 'work');
    const tagId = labeled.tags[0]?.id ?? 0;
    const apiFetch = getTestApiFetch();
    const client = createHttpClient(apiFetch);
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queries}>
        <KeeperServicesContext.Provider value={{ client, apiFetch }}>{children}</KeeperServicesContext.Provider>
      </QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => ({
      untagged: useQuery({ queryKey: keeperKeys.view('untagged'), queryFn: () => client.views.untagged() }).data,
      labeled: useQuery({ queryKey: keeperKeys.view(`tag:${String(tagId)}`), queryFn: () => client.views.tag(tagId) }).data,
      mutations: useNoteMutations(),
    }), { wrapper });
    await waitFor(() => { expect(result.current.untagged?.map((note) => note.id)).toEqual([target.id]); });
    await act(() => result.current.mutations.addTagToNotes([target.id], 'work'));
    await waitFor(() => {
      expect(result.current.untagged).toEqual([]);
      expect(result.current.labeled?.map((note) => note.id)).toContain(target.id);
    });
    await act(() => result.current.mutations.removeTag(target.id, 'work'));
    await waitFor(() => {
      expect(result.current.untagged?.map((note) => note.id)).toEqual([target.id]);
      expect(result.current.labeled?.map((note) => note.id)).toEqual([source.id]);
    });
    unmount();
    queries.clear();
  });

  it('does linear lookup and tag comparison work as both the view and selection grow', async () => {
    const base = await getTestDB().createNote({ body: 'Work count' });
    const counts: number[] = [];
    for (const size of [16, 32, 64]) {
      const queries = new QueryClient();
      let work = 0;
      const notes: NoteWithTags[] = Array.from({ length: size }, (_, index) => ({
        ...base,
        get id() { work++; return toNoteId(String(index)); },
        tags: [{ get id() { work++; return 1; }, name: 'existing', icon: null }],
      }));
      queries.setQueryData(keeperKeys.inbox, notes);
      // Count reads of the selection too: replacing Set membership with an
      // array scan must fail this test when both populations grow.
      const ids = new Proxy(notes.map((note) => note.id), {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) work++;
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      work = 0;
      await patchCachedNoteTags(queries, ids, { add: { id: 2, name: 'new', icon: null } });
      counts.push(work);
      expect(queries.getQueryData<NoteWithTags[]>(keeperKeys.inbox)?.every((note) => note.tags.length === 2)).toBe(true);
      queries.clear();
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeLessThanOrEqual(2 * (counts[0] ?? 0));
    expect(counts[2]).toBeLessThanOrEqual(2 * (counts[1] ?? 0));
  });
});
