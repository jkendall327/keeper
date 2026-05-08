import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderApp } from './app-test-utils';

describe('App markdown editing', () => {
  async function openModalWithBody(user: ReturnType<typeof userEvent.setup>, body: string) {
    const createInput = await screen.findByPlaceholderText('Take a note...');
    await user.type(createInput, 'opener');
    await user.keyboard('{Enter}');

    const noteCard = await screen.findByText('opener');
    await user.click(noteCard);

    const bodyInput = await screen.findByPlaceholderText('Note');
    await user.clear(bodyInput);
    await user.type(bodyInput, body);
    return bodyInput;
  }

  it('pressing Enter on a list item inserts a new bullet on the next line', async () => {
    const user = userEvent.setup();
    await renderApp();

    const bodyInput = await openModalWithBody(user, '- first item');

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(bodyInput).toHaveValue('- first item\n- ');
    });
  });

  it('pressing Enter on an empty bullet removes the bullet', async () => {
    const user = userEvent.setup();
    await renderApp();

    const bodyInput = await openModalWithBody(user, '- item');

    await user.keyboard('{Enter}'); // creates "- item\n- "
    await user.keyboard('{Enter}'); // empty bullet → removed

    await waitFor(() => {
      expect(bodyInput).toHaveValue('- item\n');
    });
  });
});
