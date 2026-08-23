import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../components/MarkdownPreview.tsx';

describe('MarkdownPreview task checkboxes', () => {
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
});
