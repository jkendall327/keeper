import * as Comlink from 'comlink';
import type { KeeperDB } from './types.ts';

let instance: Comlink.Remote<KeeperDB> | null = null;

export function getDB(): Comlink.Remote<KeeperDB> {
  if (!instance) {
    const worker = new Worker(
      new URL('./db.worker.ts', import.meta.url),
      { type: 'module' },
    );
    instance = Comlink.wrap<KeeperDB>(worker);

    // Request persistent storage (fire-and-forget)
    void navigator.storage.persist();
  }
  return instance;
}
