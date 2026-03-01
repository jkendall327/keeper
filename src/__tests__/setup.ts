import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Stub EventSource for jsdom (used by useDB for SSE)
if (typeof globalThis.EventSource === 'undefined') {
  globalThis.EventSource = class EventSource {
    close() {}
    addEventListener() {}
  } as unknown as typeof globalThis.EventSource;
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
