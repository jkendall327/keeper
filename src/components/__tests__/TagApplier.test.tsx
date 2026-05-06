import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toNoteId } from '../../db/types.ts';
import { TagApplier } from '../TagApplier.tsx';

const tags = [
  { id: 1, name: 'work', icon: null },
];

const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
const originalOffsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

function renderAnchoredTagApplier(anchorRect: Partial<DOMRect>) {
  const anchor = document.createElement('button');
  anchor.getBoundingClientRect = vi.fn(() => ({
    bottom: 140,
    height: 20,
    left: 20,
    right: 40,
    top: 120,
    width: 20,
    x: 20,
    y: 120,
    toJSON: () => ({}),
    ...anchorRect,
  }));

  render(
    <TagApplier
      noteIds={[toNoteId('note-1')]}
      appliedTags={[]}
      allTags={tags}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onClose={vi.fn()}
      anchorRef={{ current: anchor }}
    />,
  );

  const panel = screen.getByText('Label note').parentElement;
  if (panel === null) throw new Error('Tag applier panel not found');
  return panel;
}

describe('TagApplier', () => {
  afterEach(() => {
    if (originalClientWidthDescriptor === undefined) {
      Reflect.deleteProperty(document.documentElement, 'clientWidth');
    } else {
      Object.defineProperty(document.documentElement, 'clientWidth', originalClientWidthDescriptor);
    }
    if (originalOffsetWidthDescriptor === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth');
    } else {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidthDescriptor);
    }
  });

  it('opens to the right of the anchor when there is enough space', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 240 });

    const panel = renderAnchoredTagApplier({ left: 100, right: 120 });

    expect(panel).toHaveStyle({ left: '100px' });
  });

  it('opens to the left of the anchor when the right edge would overflow', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 240 });

    const panel = renderAnchoredTagApplier({ left: 250, right: 270 });

    expect(panel).toHaveStyle({ left: '30px' });
  });
});
