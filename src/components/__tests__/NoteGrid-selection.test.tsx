import { Profiler, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteGrid } from '../NoteGrid.tsx';
import { toNoteId, type NoteWithTags } from '../../db/types.ts';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id); }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => { for (const callback of pending) callback(0); });
}

function setup(size: number, overrides: Partial<ComponentProps<typeof NoteGrid>> = {}) {
  const notes: NoteWithTags[] = Array.from({ length: size }, (_, index) => ({
    id: toNoteId(String(index)), title: '', body: `Note ${String(index)}`,
    pinned: false, archived: false, trashed: false, has_links: false,
    created_at: '2026-09-24 12:00:00', updated_at: '2026-09-24 12:00:00',
    tags: [], link_metadata: [],
  }));
  const onBulkSelect = vi.fn();
  const onClearSelection = vi.fn();
  const reminders = new Map();
  const noteLookups = vi.spyOn(reminders, 'get');
  const commits = vi.fn();
  const commands = {
    update: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined),
    togglePin: vi.fn().mockResolvedValue(undefined), archiveOrRestore: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined), removeTag: vi.fn().mockResolvedValue(undefined),
  };
  const props = {
    notes, remindersByNoteId: reminders, allTags: [], onSelect: vi.fn(), noteCommands: commands,
    selectedNoteIds: new Set<ReturnType<typeof toNoteId>>(), onBulkSelect, onClearSelection,
    showLinkPreviews: false, isMobile: false, ...overrides,
  };
  const rendered = render(<Profiler id="grid" onRender={commits}><NoteGrid {...props} /></Profiler>);
  const wrapper = rendered.container.firstElementChild;
  if (!(wrapper instanceof HTMLElement)) throw new Error('Missing grid');
  const cards = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-note-id]'));
  const wrapperBounds = vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 500, 500));
  const cardBounds = cards.map((card, index) => vi.spyOn(card, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(110, 110 + index * 40, 100, 30)));
  const rectangle = document.body.querySelector<HTMLElement>('[aria-hidden="true"][hidden]');
  if (rectangle === null) throw new Error('Missing selection overlay');
  noteLookups.mockClear();
  commits.mockClear();
  return { ...rendered, wrapper, wrapperBounds, cardBounds, rectangle, onBulkSelect, onClearSelection, noteLookups, commits };
}

describe('note rectangle selection', () => {
  it.each([8, 32, 128])('does constant work per frame and one linear hit-test for %i notes', (size) => {
    const grid = setup(size);
    fireEvent.mouseDown(grid.wrapper, { button: 0, clientX: 101, clientY: 101 });
    expect(grid.wrapperBounds).toHaveBeenCalledTimes(1);

    for (let frame = 0; frame < 4; frame++) {
      for (let event = 0; event < 20; event++) {
        fireEvent.mouseMove(document, { clientX: 220 + event, clientY: 200 + frame });
      }
      expect(frames.size).toBe(1);
      // Mouse events only store coordinates; they don't read layout.
      expect(grid.wrapperBounds).toHaveBeenCalledTimes(1 + frame);
      flushFrame();
      expect(grid.wrapperBounds).toHaveBeenCalledTimes(2 + frame);
    }
    expect(grid.rectangle.hidden).toBe(false);
    expect(grid.rectangle.style.transform).toBe('translate(101px, 101px)');
    expect(grid.rectangle.style.width).toBe('138px');
    expect(grid.rectangle.style.height).toBe('102px');
    expect(grid.noteLookups).not.toHaveBeenCalled();
    expect(grid.commits).not.toHaveBeenCalled();
    expect(grid.cardBounds.reduce((total, spy) => total + spy.mock.calls.length, 0)).toBe(0);

    // Finish before the pending frame: the last movement must still count.
    fireEvent.mouseMove(document, { clientX: 239, clientY: 300 });
    fireEvent.mouseUp(document);
    expect(frames.size).toBe(0);
    expect(grid.rectangle.hidden).toBe(true);
    expect(grid.wrapperBounds).toHaveBeenCalledTimes(6);
    expect(grid.cardBounds.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(grid.onBulkSelect).toHaveBeenCalledExactlyOnceWith(new Set(['0', '1', '2', '3', '4']));
  });

  it('accounts for scrolling and supports reverse additive drags', () => {
    const grid = setup(4, { selectedNoteIds: new Set([toNoteId('3')]) });
    fireEvent.mouseDown(grid.wrapper, { button: 0, clientX: 230, clientY: 175, ctrlKey: true });
    fireEvent.mouseMove(document, { clientX: 105, clientY: 105 });
    flushFrame();
    expect(grid.rectangle.style.transform).toBe('translate(105px, 105px)');
    grid.wrapperBounds.mockReturnValue(new DOMRect(100, 80, 500, 500));
    fireEvent.scroll(document);
    flushFrame();
    expect(grid.rectangle.style.height).toBe('50px');
    fireEvent.mouseUp(document);
    expect(grid.onBulkSelect).toHaveBeenCalledExactlyOnceWith(new Set(['3', '0', '1']));
  });

  it('clears selection on a click and ignores gestures starting on a card', () => {
    const grid = setup(1);
    fireEvent.mouseDown(grid.wrapper, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 102, clientY: 101 });
    fireEvent.mouseUp(document);
    expect(grid.onClearSelection).toHaveBeenCalledTimes(1);
    const card = grid.wrapper.querySelector('[data-note-id]');
    if (card === null) throw new Error('Missing card');
    fireEvent.mouseDown(card, { button: 0, clientX: 110, clientY: 110 });
    fireEvent.mouseMove(document, { clientX: 250, clientY: 250 });
    fireEvent.mouseUp(document);
    expect(frames.size).toBe(0);
    expect(grid.onBulkSelect).not.toHaveBeenCalled();
    expect(grid.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it.each(['escape', 'blur', 'unmount'])('cleans up the overlay and pending frame on %s', (reason) => {
    const grid = setup(1);
    fireEvent.mouseDown(grid.wrapper, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 250, clientY: 250 });
    flushFrame();
    expect(document.body).toHaveClass('is-drag-selecting');
    fireEvent.mouseMove(document, { clientX: 300, clientY: 300 });
    if (reason === 'escape') fireEvent.keyDown(document, { key: 'Escape' });
    else if (reason === 'blur') fireEvent.blur(window);
    else grid.unmount();
    expect(frames.size).toBe(0);
    expect(document.body).not.toHaveClass('is-drag-selecting');
    if (reason !== 'unmount') expect(grid.rectangle.hidden).toBe(true);
    fireEvent.mouseUp(document);
    expect(grid.onBulkSelect).not.toHaveBeenCalled();
  });
});
