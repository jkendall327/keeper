import { describe, it, expect } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderApp, setTestDocumentHasFocus, setTestVisibilityState, TestEventSource } from './app-test-utils';

describe('App extension badge events', () => {
it('shows extension-created notes as unseen in the tab title until the tab is focused', async () => {
  await renderApp();
  await waitFor(() => {
    expect(TestEventSource.instances).toHaveLength(1);
  });

  setTestDocumentHasFocus(false);
  setTestVisibilityState('hidden');

  act(() => {
    TestEventSource.instances[0]?.emit('extension-note-created');
  });
  expect(document.title).toBe('(1) keeper');

  act(() => {
    TestEventSource.instances[0]?.emit('extension-note-created');
  });
  expect(document.title).toBe('(2) keeper');

  setTestDocumentHasFocus(true);
  setTestVisibilityState('visible');
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(document.title).toBe('keeper');
});
});
