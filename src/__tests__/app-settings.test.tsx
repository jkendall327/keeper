import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getTestApiFetch, getTestDB, renderApp, useFileBackedTestApp } from './app-test-utils';

describe('App settings', () => {
it('settings button renders the settings icon glyph', async () => {
  await renderApp();

  const settingsBtn = screen.getByLabelText('Open settings');
  expect(settingsBtn).toHaveTextContent('settings');
});

  it('opens settings modal when gear icon is clicked', async () => {
    const user = userEvent.setup();
    await renderApp();

    const settingsBtn = screen.getByLabelText('Open settings');
    await user.click(settingsBtn);

    const heading = screen.getByText('Settings');
    expect(heading).toBeInTheDocument();
    const keyLabel = screen.getByLabelText('OpenRouter API Key');
    expect(keyLabel).toBeInTheDocument();
  });

  it('API key input has type=password', async () => {
    const user = userEvent.setup();
    await renderApp();

    const settingsBtn = screen.getByLabelText('Open settings');
    await user.click(settingsBtn);

    const keyInput = screen.getByLabelText('OpenRouter API Key');
    expect(keyInput).toHaveAttribute('type', 'password');
  });

  it('closes settings modal on backdrop click', async () => {
    const user = userEvent.setup();
    await renderApp();

    const settingsBtn = screen.getByLabelText('Open settings');
    await user.click(settingsBtn);
    expect(screen.getByText('Settings')).toBeInTheDocument();

    await user.click(screen.getByTestId('settings-modal-backdrop'));

    await waitFor(() => {
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });
  });

  it('saves and clears API key via settings UI', async () => {
    const user = userEvent.setup();
    await renderApp();

    const settingsBtn = screen.getByLabelText('Open settings');
    await user.click(settingsBtn);

    const keyInput = screen.getByLabelText('OpenRouter API Key');
    await user.type(keyInput, 'sk-or-test-key');

    const saveBtn = screen.getByText('Save');
    await user.click(saveBtn);

    // Should show saved confirmation and configured status
    await screen.findByText('Saved!');
    const status = screen.getByText('Configured');
    expect(status).toBeInTheDocument();

    // Should be stored in localStorage
    const storedKey = localStorage.getItem('keeper-openrouter-key');
    expect(storedKey).toBe('sk-or-test-key');

    // Clear the key
    const clearBtn = screen.getByText('Clear key');
    await user.click(clearBtn);

    // Status should change to not configured
    const notConfigured = screen.getByText('Not configured');
    expect(notConfigured).toBeInTheDocument();
    const clearedKey = localStorage.getItem('keeper-openrouter-key');
    expect(clearedKey).toBeNull();
  });

  it('creates, edits, and deletes autotag rules', async () => {
    const user = userEvent.setup();
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    await renderApp();

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Autotag Rules' }));

    const patternInput = screen.getByLabelText('URL regex');
    const tagInput = screen.getByLabelText('Tags');
    await user.type(patternInput, 'example\\.com');
    await user.type(tagInput, 'web');
    await user.keyboard('{Enter}');
    await user.click(screen.getByText('Create Rule'));

    await screen.findByText('/example\\.com/i');
    expect(screen.getByText('web')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Edit autotag rule example\\.com'));
    await user.clear(patternInput);
    await user.type(patternInput, 'docs\\.example');
    await user.click(screen.getByLabelText('Remove rule tag web'));
    await user.type(tagInput, 'docs');
    await user.keyboard('{Enter}');
    await user.click(screen.getByText('Save Rule'));

    await screen.findByText('/docs\\.example/i');
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.queryByText('/example\\.com/i')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Delete autotag rule docs\\.example'));
    await waitFor(() => {
      expect(screen.queryByText('/docs\\.example/i')).not.toBeInTheDocument();
    });
    expect(screen.getByText('No autotag rules configured.')).toBeInTheDocument();

    window.confirm = originalConfirm;
  });

  it('suggests existing tags when editing autotag rules', async () => {
    const user = userEvent.setup();
    await renderApp();

    const noteInput = await screen.findByPlaceholderText('Take a note...');
    await user.type(noteInput, 'Tagged source note');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByText('Tagged source note'));
    const noteTagInput = await screen.findByPlaceholderText('Add tag...');
    await user.type(noteTagInput, 'work');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Autotag Rules' }));

    const tagInput = screen.getByLabelText('Tags');
    await user.type(tagInput, 'wo');

    const settingsDialog = screen.getByRole('dialog', { name: 'Settings' });
    const suggestion = await within(settingsDialog).findByRole('option', { name: 'work' });
    await user.click(suggestion);

    expect(screen.getByLabelText('Remove rule tag work')).toBeInTheDocument();
    expect(tagInput).toHaveValue('');
  });

  it('toggles extension note count badges', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Notes' }));

    const toggle = screen.getByRole('checkbox', { name: /Show extension note count in tab title/ });
    expect(toggle).toBeChecked();

    await user.click(toggle);
    await waitFor(() => {
      expect(toggle).not.toBeChecked();
    });
    await expect(getTestDB().getAppSettings()).resolves.toMatchObject({ extensionBadgeEnabled: false });
    expect(toggle).not.toBeChecked();
  });

  it('downloads a backup from settings', async () => {
    const user = userEvent.setup();
    await useFileBackedTestApp();
    const createObjectUrl = vi.fn(() => 'blob:keeper-backup');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await renderApp();

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Backup & Import' }));
    await user.click(screen.getByRole('button', { name: /Download Backup/ }));

    await screen.findByText('Backup download started.');
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:keeper-backup');
  });

  it('uploads a backup archive for restore after confirmation', async () => {
    const user = userEvent.setup();
    await useFileBackedTestApp();
    const backupResponse = await getTestApiFetch()('/api/backup?includeMedia=true');
    const backupBlob = await backupResponse.blob();
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    await renderApp();

    await user.click(screen.getByLabelText('Open settings'));
    await user.click(screen.getByRole('tab', { name: 'Backup & Import' }));
    await user.upload(
      screen.getByLabelText('Backup archive'),
      new File([backupBlob], 'keeper-backup.keeper.zip', { type: 'application/zip' }),
    );
    await user.click(screen.getByRole('button', { name: /Restore Backup/ }));

    await screen.findByText(/Restore complete/);
    expect(confirmMock).toHaveBeenCalled();
  });
});
