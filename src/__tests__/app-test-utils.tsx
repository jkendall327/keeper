import { beforeEach, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { createMockDB } from './mock-db';
import type { MockDB } from './mock-db';

export const mockDB: MockDB = createMockDB();

let testVisibilityState: DocumentVisibilityState = 'visible';
let testDocumentHasFocus = true;

export class TestEventSource {
  static instances: TestEventSource[] = [];
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(_url: string) {
    TestEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() { /* noop test double */ }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }
}

vi.mock('../db/db-client', () => ({
  getDB: () => mockDB,
}));

const { default: App } = await import('../App');

export function setTestVisibilityState(value: DocumentVisibilityState) {
  testVisibilityState = value;
}

export function setTestDocumentHasFocus(value: boolean) {
  testDocumentHasFocus = value;
}

export async function renderApp() {
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => { render(<App />); });
}

export function getNoteCardByText(text: string | RegExp) {
  const card = screen.getByText(text).closest<HTMLElement>('[data-note-id][role="button"]');
  if (card === null) throw new Error(`Note card not found for ${String(text)}`);
  return card;
}

export function getSidebar() {
  return screen.getByRole('complementary', { name: 'Sidebar' });
}

export function getSidebarTagButton(name: string) {
  return within(getSidebar()).getByRole('button', { name });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockDB.reset();
  localStorage.clear();
  document.title = 'keeper';
  TestEventSource.instances = [];
  globalThis.EventSource = TestEventSource as unknown as typeof EventSource;
  testVisibilityState = 'visible';
  testDocumentHasFocus = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => testVisibilityState,
  });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => testDocumentHasFocus);
});
