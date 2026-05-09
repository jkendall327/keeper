import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderApp } from './app-test-utils';

describe('App chat view', () => {
  it('shows Chat entry in the sidebar', async () => {
    await renderApp();
    const chatBtn = screen.getByText('Chat');
    expect(chatBtn).toBeInTheDocument();
  });

  it('shows API key required when clicking Chat without a key', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('keeper-openrouter-key');
    await renderApp();

    const chatBtn = screen.getByText('Chat');
    await user.click(chatBtn);

    const keyRequired = screen.getByText('API key required');
    expect(keyRequired).toBeInTheDocument();
    const hint = screen.getByText(/Configure your OpenRouter API key/);
    expect(hint).toBeInTheDocument();
  });

  it('hides notes view when Chat is active', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note first
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Test note');
    await user.keyboard('{Enter}');
    await screen.findByText('Test note');

    // Switch to Chat
    const chatBtn = screen.getByText('Chat');
    await user.click(chatBtn);

    // Note and search bar should not be visible
    await waitFor(() => {
      expect(screen.queryByText('Test note')).not.toBeInTheDocument();
    });
  });

  it('opens chat from a direct URL', async () => {
    await renderApp('/chat');

    expect(await screen.findByText('API key required')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Take a note...')).not.toBeInTheDocument();
  });

  it('returns to notes view when switching back from Chat', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Create a note
    const input = await screen.findByPlaceholderText('Take a note...');
    await user.type(input, 'Persistent note');
    await user.keyboard('{Enter}');
    const noteCard = await screen.findByText('Persistent note');
    expect(noteCard).toBeInTheDocument();

    // Switch to Chat
    const chatBtn = screen.getByText('Chat');
    await user.click(chatBtn);

    // Switch back to Notes
    const notesBtn = screen.getByText('Inbox');
    await user.click(notesBtn);

    // Note should be visible again
    const restoredNote = await screen.findByText('Persistent note');
    expect(restoredNote).toBeInTheDocument();
  });
});
