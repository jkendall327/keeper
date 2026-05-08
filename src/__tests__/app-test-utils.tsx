import { afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, act, cleanup } from '@testing-library/react';
import { createFileBackedTestApp, createTestApp, type TestApp } from '../../server/__tests__/test-app.ts';
import type { KeeperDB } from '../db/types.ts';

let currentTestApp: TestApp | null = null;
const nativeFetch = globalThis.fetch.bind(globalThis);

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

export function setTestVisibilityState(value: DocumentVisibilityState) {
  testVisibilityState = value;
}

export function setTestDocumentHasFocus(value: boolean) {
  testDocumentHasFocus = value;
}

export function getTestDB(): KeeperDB {
  if (currentTestApp === null) throw new Error('Test app has not been created');
  return currentTestApp.db;
}

export async function useFileBackedTestApp() {
  await closeCurrentTestApp();
  currentTestApp = await createFileBackedTestApp();
  installFetchBridge(currentTestApp);
}

export async function renderApp() {
  const { default: App } = await import('../App');
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

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.title = 'keeper';
  TestEventSource.instances = [];
  globalThis.EventSource = TestEventSource as unknown as typeof EventSource;
  currentTestApp = await createTestApp();
  installFetchBridge(currentTestApp);
  testVisibilityState = 'visible';
  testDocumentHasFocus = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => testVisibilityState,
  });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => testDocumentHasFocus);
});

afterEach(async () => {
  cleanup();
  await closeCurrentTestApp();
});

async function closeCurrentTestApp() {
  if (currentTestApp === null) return;
  await currentTestApp.app.close();
  await currentTestApp.cleanup?.();
  currentTestApp = null;
}

function installFetchBridge(testApp: TestApp) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = getRequestUrl(input);
    if (!url.startsWith('/api/')) {
      return nativeFetch(input, init);
    }

    const method = init?.method ?? request?.method ?? 'GET';
    const headers = new Headers(request?.headers);
    if (init?.headers !== undefined) {
      new Headers(init.headers).forEach((value, key) => { headers.set(key, value); });
    }

    const body = init?.body ?? request?.body ?? undefined;
    const payload = await serializeBody(body, headers);
    const injected = await (testApp.app.inject as unknown as (options: {
      method: string;
      url: string;
      headers: Record<string, string>;
      payload?: unknown;
    }) => Promise<{
      rawPayload?: Buffer;
      payload: string;
      statusCode: number;
      statusMessage: string;
      headers: Record<string, number | string | string[] | undefined>;
    }>)({
      method,
      url,
      headers: Object.fromEntries(headers.entries()),
      payload,
    });

    const responseBody = injected.rawPayload === undefined
      ? injected.payload
      : new Uint8Array(injected.rawPayload);
    return new Response(responseBody, {
      status: injected.statusCode,
      statusText: injected.statusMessage,
      headers: normalizeResponseHeaders(injected.headers),
    });
  };
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return `${input.pathname}${input.search}`;
  return `${new URL(input.url).pathname}${new URL(input.url).search}`;
}

async function serializeBody(body: BodyInit | ReadableStream<Uint8Array> | null | undefined, headers: Headers) {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData) return serializeFormData(body, headers);
  if (typeof body === 'string') return body;
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  return body;
}

async function serializeFormData(form: FormData, headers: Headers): Promise<Buffer> {
  const boundary = '----keeper-ui-test-boundary';
  const chunks: Buffer[] = [];

  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ));
    } else {
      const filename = value.name === '' ? 'blob' : value.name;
      const contentType = value.type === '' ? 'application/octet-stream' : value.type;
      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ));
      chunks.push(Buffer.from(await value.arrayBuffer()));
      chunks.push(Buffer.from('\r\n'));
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  headers.set('content-type', `multipart/form-data; boundary=${boundary}`);
  return Buffer.concat(chunks);
}

function normalizeResponseHeaders(headers: Record<string, number | string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result.set(key, value.join(', '));
    } else {
      result.set(key, String(value));
    }
  }
  return result;
}
