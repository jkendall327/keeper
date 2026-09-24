// @vitest-environment node
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { createEventBroadcaster } from '../events.ts';

it('excludes the requesting tab while refreshing other and legacy SSE clients', async () => {
  const app = Fastify();
  const { broadcast, registerEventRoutes } = createEventBroadcaster();
  registerEventRoutes(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  try {
    for (const suffix of ['?sourceId=origin', '?sourceId=other', '']) {
      const response = await fetch(`${address}/api/events${suffix}`);
      if (response.body === null) throw new Error('Missing event stream');
      readers.push(response.body.getReader());
    }
    broadcast('refresh', 'origin');
    broadcast('done');
    const messages = await Promise.all(readers.map(async (reader) => {
      let message = '';
      const decoder = new TextDecoder();
      while (!message.includes('event: done')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Event stream ended early');
        message += decoder.decode(value);
      }
      return message;
    }));
    expect(messages[0]).not.toContain('event: refresh');
    expect(messages[1]).toContain('event: refresh');
    expect(messages[2]).toContain('event: refresh');
  } finally {
    await Promise.all(readers.map((reader) => reader.cancel()));
    await app.close();
  }
});
