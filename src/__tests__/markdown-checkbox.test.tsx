import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../components/MarkdownPreview.tsx';
import { markdown } from '@motioneffector/markdown';

vi.mock('@motioneffector/markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@motioneffector/markdown')>();
  return { ...actual, markdown: vi.fn(actual.markdown) };
});

describe('MarkdownPreview task checkboxes', () => {
  it('renders a large checklist view with one parse per note until a task is clicked', async () => {
    const user = userEvent.setup();
    const onCheckboxToggle = vi.fn();
    vi.mocked(markdown).mockClear();
    const view = <>{Array.from({ length: 100 }, (_, index) => (
      <MarkdownPreview key={index} content={`- [ ] Task ${String(index)}`} onCheckboxToggle={onCheckboxToggle} />
    ))}</>;
    const { unmount } = render(view);

    expect(markdown).toHaveBeenCalledTimes(100);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(100);
    const task = checkboxes[50];
    if (task === undefined) throw new Error('Missing task');
    await user.click(task);
    expect(markdown).toHaveBeenCalledTimes(101);
    expect(onCheckboxToggle).toHaveBeenCalledWith('- [x] Task 50');

    unmount();
    render(view);
    expect(screen.getAllByRole('checkbox')).toHaveLength(100);
    expect(markdown).toHaveBeenCalledTimes(101);
  });

  it('maps tasks against the latest content after a note update', async () => {
    const user = userEvent.setup();
    const onCheckboxToggle = vi.fn();
    const { rerender } = render(<MarkdownPreview content="- [ ] Original" onCheckboxToggle={onCheckboxToggle} />);
    await user.click(screen.getByRole('checkbox'));

    rerender(<MarkdownPreview content={'New introduction\n\n- [x] Revised'} onCheckboxToggle={onCheckboxToggle} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onCheckboxToggle).toHaveBeenLastCalledWith('New introduction\n\n- [ ] Revised');
  });

  it('toggles the rendered task instead of a checkbox-like marker in prose', async () => {
    const user = userEvent.setup();
    const onCheckboxToggle = vi.fn();
    render(
      <MarkdownPreview
        content={'[ ] example marker\n\n- [ ] actual task'}
        onCheckboxToggle={onCheckboxToggle}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onCheckboxToggle).toHaveBeenCalledWith(
      '[ ] example marker\n\n- [x] actual task',
    );
  });

  it('ignores task-like markers inside fenced code blocks', async () => {
    const user = userEvent.setup();
    const onCheckboxToggle = vi.fn();
    render(
      <MarkdownPreview
        content={'```\n- [ ] code example\n```\n\n- [ ] actual task'}
        onCheckboxToggle={onCheckboxToggle}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onCheckboxToggle).toHaveBeenCalledWith(
      '```\n- [ ] code example\n```\n\n- [x] actual task',
    );
  });

  it('ignores task-like markers inside indented code blocks', async () => {
    const user = userEvent.setup();
    const onCheckboxToggle = vi.fn();
    render(
      <MarkdownPreview
        content={'    - [ ] code example\n\n- [ ] actual task'}
        onCheckboxToggle={onCheckboxToggle}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onCheckboxToggle).toHaveBeenCalledWith(
      '    - [ ] code example\n\n- [x] actual task',
    );
  });

  it('continues to toggle deeply nested tasks', async () => {
    const user = userEvent.setup();
    const onCheckboxToggle = vi.fn();
    render(
      <MarkdownPreview
        content={'- parent\n  - child\n    - [ ] grandchild task'}
        onCheckboxToggle={onCheckboxToggle}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onCheckboxToggle).toHaveBeenCalledWith(
      '- parent\n  - child\n    - [x] grandchild task',
    );
  });
});
