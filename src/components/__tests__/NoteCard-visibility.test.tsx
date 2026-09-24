import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteCard } from '../NoteCard.tsx';
import { observeNoteCard } from '../note-card-visibility.ts';
import { toNoteId, type NoteWithTags } from '../../db/types.ts';

let intersectionCallback: IntersectionObserverCallback;
let resizeCallback: ResizeObserverCallback;
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();
let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.clearAllMocks();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
      intersectionCallback = callback;
      expect(options.rootMargin).toBe('1200px 0px');
    }
    observe = observe;
    unobserve = unobserve;
    disconnect = disconnect;
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
    observe() { /* Driven explicitly by these tests. */ }
    unobserve() { /* Driven explicitly by these tests. */ }
    disconnect() { /* Driven explicitly by these tests. */ }
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function entry(target: Element, isIntersecting: boolean, height = 240): IntersectionObserverEntry {
  return {
    target, isIntersecting, boundingClientRect: new DOMRect(0, 0, 300, height),
    intersectionRatio: isIntersecting ? 1 : 0, intersectionRect: new DOMRect(), rootBounds: null, time: 0,
  };
}

function intersect(target: Element, visible: boolean, height = 240) {
  act(() => { intersectionCallback([entry(target, visible, height)], {} as IntersectionObserver); });
}

function resize(target: Element, width: number) {
  act(() => {
    resizeCallback([{
      target, contentRect: new DOMRect(0, 0, width, 200),
      borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [],
    }], {} as ResizeObserver);
  });
}

function flushFrame() {
  const pending = frames;
  frames = [];
  act(() => { for (const callback of pending) callback(0); });
}

const note: NoteWithTags = {
  id: toNoteId('note'), title: 'A note', body: 'Original content',
  pinned: false, archived: false, trashed: false, has_links: false,
  created_at: '2026-09-24 12:00:00', updated_at: '2026-09-24 12:00:00', tags: [], link_metadata: [],
};

function setup() {
  const props = {
    note, reminder: null, allTags: [], onSelect: vi.fn(), onSelectionToggle: vi.fn(), onLongPress: vi.fn(),
    showLinkPreviews: false, isMobile: false,
    noteCommands: {
      update: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined),
      togglePin: vi.fn().mockResolvedValue(undefined), archiveOrRestore: vi.fn().mockResolvedValue(undefined),
      addTag: vi.fn().mockResolvedValue(undefined), removeTag: vi.fn().mockResolvedValue(undefined),
    },
  };
  const rendered = render(<NoteCard {...props} />);
  const card = rendered.container.firstElementChild as HTMLElement;
  return { ...rendered, props, card };
}

describe('offscreen note contents', () => {
  it('replaces distant contents with an accurately sized, selectable card and restores them nearby', () => {
    const { card, props } = setup();
    expect(screen.getByText('Original content')).toBeInTheDocument();
    intersect(card, false, 243.5);
    expect(card).toHaveAttribute('data-note-placeholder');
    expect(card.children).toHaveLength(0);
    expect(card.style.height).toBe('243.5px');
    expect(card.style.boxSizing).toBe('border-box');
    expect(card).toHaveAttribute('data-note-id', note.id);
    fireEvent.click(card, { shiftKey: true });
    expect(props.onSelect).toHaveBeenCalledWith(note, expect.objectContaining({ shiftKey: true }));
    intersect(card, true);
    expect(card).not.toHaveAttribute('data-note-placeholder');
    expect(card.style.height).toBe('');
    expect(screen.getByText('Original content')).toBeInTheDocument();
  });

  it('remeasures changed content instead of keeping an outdated placeholder height', () => {
    const { card, props, rerender } = setup();
    intersect(card, false);
    rerender(<NoteCard {...props} note={{ ...note, body: 'Changed content', tags: [{ id: 1, name: 'work', icon: null }] }} />);
    expect(screen.getByText('Changed content')).toBeInTheDocument();
    expect(card.style.height).toBe('');
    intersect(card, false, 280);
    expect(card.style.height).toBe('280px');
    intersect(card, true);
    expect(screen.getByRole('button', { name: 'Show notes tagged work' })).toBeInTheDocument();
  });

  it('restores offscreen contents for width changes before taking a new measurement', () => {
    const { card } = setup();
    resize(card, 300);
    intersect(card, false);
    resize(card, 200);
    expect(screen.getByText('Original content')).toBeInTheDocument();
    expect(card.style.height).toBe('');
    // Ignore a queued intersection result describing the old placeholder.
    intersect(card, false, 240);
    expect(card.style.height).toBe('');
    flushFrame();
    intersect(card, false, 320);
    expect(card.style.height).toBe('320px');
  });

  it('retains focused contents and an open label picker outside the viewport', () => {
    const { card } = setup();
    intersect(card, false);
    fireEvent.focus(card);
    expect(screen.getByText('Original content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Label note' }));
    fireEvent.blur(card, { relatedTarget: document.body });
    intersect(card, false);
    expect(screen.getByPlaceholderText('Enter label name')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(card).toHaveAttribute('data-note-placeholder');
  });

  it('keeps normal rendering when observers are unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { card } = setup();
    expect(screen.getByText('Original content')).toBeInTheDocument();
    expect(card).not.toHaveAttribute('data-note-placeholder');
  });

  it('processes only changed entries as the registered population grows', () => {
    for (const size of [16, 64, 256]) {
      observe.mockClear();
      const callbacks = Array.from({ length: size }, () => vi.fn());
      const elements = Array.from({ length: size }, () => document.createElement('div'));
      const cleanups = elements.map((element, index) => observeNoteCard(element, callbacks[index] ?? vi.fn()));
      expect(observe).toHaveBeenCalledTimes(size);
      const first = elements[0];
      if (first === undefined) throw new Error('Missing first card');
      let entryReads = 0;
      const changed = entry(first, false);
      Object.defineProperty(changed, 'target', { get: () => { entryReads++; return first; } });
      intersectionCallback([changed], {} as IntersectionObserver);
      expect(callbacks.reduce((count, callback) => count + callback.mock.calls.length, 0)).toBe(1);
      expect(entryReads).toBe(2);
      // Initial processing is a single pass too, with one callback per card.
      for (const callback of callbacks) callback.mockClear();
      intersectionCallback(elements.map((element) => entry(element, false)), {} as IntersectionObserver);
      expect(callbacks.reduce((count, callback) => count + callback.mock.calls.length, 0)).toBe(size);
      for (const clean of cleanups) clean();
    }
  });
});
