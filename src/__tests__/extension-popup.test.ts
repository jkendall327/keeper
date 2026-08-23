import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const popupHtml = readFileSync(resolve(process.cwd(), 'extension/popup.html'), 'utf8');
const popupScript = readFileSync(resolve(process.cwd(), 'extension/popup.js'), 'utf8');

function renderPopupElements() {
  document.body.innerHTML = `
    <textarea id="quickNote"></textarea>
    <button id="sendQuickNote" type="button"></button>
    <input id="serverUrl">
    <button id="save" type="button"></button>
    <button id="saveRightInclusive" type="button"></button>
    <button id="saveRightExclusive" type="button"></button>
    <div id="status"></div>
    <div id="errors"></div>
  `;
}

describe('extension quick note popup', () => {
  it('marks the quick note as the initial focus target', () => {
    const parsed = new DOMParser().parseFromString(popupHtml, 'text/html');
    const quickNote = parsed.querySelector('#quickNote');

    expect(quickNote).toHaveAttribute('autofocus');
    expect(quickNote).toHaveAttribute('aria-describedby', 'quickNoteHint');
  });

  it('focuses the quick note when the popup activates and submits with Ctrl/Cmd+Enter', async () => {
    renderPopupElements();

    const sendMessage = vi.fn((_message: unknown, callback: (response: { ok: boolean }) => void) => {
      callback({ ok: true });
    });
    const chrome = {
      runtime: { sendMessage, lastError: undefined },
      storage: {
        sync: {
          get: vi.fn((_defaults: unknown, callback: (result: { serverUrl: string }) => void) => {
            callback({ serverUrl: 'http://localhost:3001' });
          }),
          set: vi.fn(),
        },
        local: {
          get: vi.fn((_key: unknown, callback: (result: { recentErrors: unknown[] }) => void) => {
            callback({ recentErrors: [] });
          }),
          remove: vi.fn(),
        },
      },
    };

    runInNewContext(popupScript, {
      chrome,
      Date,
      document,
      isNaN,
      requestAnimationFrame: (callback: () => void) => {
        callback();
      },
      URL,
      window,
    });

    const quickNote = document.querySelector<HTMLTextAreaElement>('#quickNote');
    expect(quickNote).not.toBeNull();
    if (quickNote === null) return;

    window.dispatchEvent(new Event('focus'));
    expect(document.activeElement).toBe(quickNote);

    quickNote.value = 'A multiline note';
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    quickNote.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();

    const controlEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    quickNote.dispatchEvent(controlEnter);
    expect(controlEnter.defaultPrevented).toBe(true);

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        { type: 'save-quick-note', body: 'A multiline note' },
        expect.any(Function),
      );
      expect(quickNote.value).toBe('');
      expect(document.activeElement).toBe(quickNote);
    });

    sendMessage.mockClear();
    quickNote.value = 'Mac shortcut';
    quickNote.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        { type: 'save-quick-note', body: 'Mac shortcut' },
        expect.any(Function),
      );
    });
  });
});
