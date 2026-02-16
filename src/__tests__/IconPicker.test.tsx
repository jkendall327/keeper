import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconPicker } from '../components/IconPicker.tsx';

describe('IconPicker', () => {
  it('calls onSelect with the icon name when an icon is clicked', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<IconPicker onSelect={onSelect} onClose={onClose} />);

    const starButton = screen.getByTitle('star');
    await user.click(starButton);

    expect(onSelect).toHaveBeenCalledWith('star');
  });

  it('does not call onClose when clicking inside the picker', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<IconPicker onSelect={onSelect} onClose={onClose} />);

    const starButtons = screen.getAllByTitle('star');
    const firstStar = starButtons[0];
    if (firstStar === undefined) throw new Error('Expected star button');
    await user.click(firstStar);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when clicking outside the picker', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <div>
        <button data-testid="outside">Outside</button>
        <IconPicker onSelect={onSelect} onClose={onClose} />
      </div>,
    );

    const outsideButton = screen.getByTestId('outside');
    await user.click(outsideButton);

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
