// Typed custom event system — prevents typos in event names at compile time
interface KeeperEventMap {
  "keeper:bulk-delete": CustomEvent<void>;
  "keeper:bulk-archive": CustomEvent<void>;
  "keeper:export": CustomEvent<void>;
}

export type KeeperEventName = keyof KeeperEventMap;

export function dispatchKeeper(name: KeeperEventName): void {
  window.dispatchEvent(new CustomEvent(name));
}

export function onKeeper(
  name: KeeperEventName,
  handler: () => void,
): () => void {
  window.addEventListener(name, handler);
  return () => {
    window.removeEventListener(name, handler);
  };
}
