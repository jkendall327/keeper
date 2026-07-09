import { afterEach, describe, expect, it, vi } from "vitest";
import { createLinkMetadataQueue } from "../link-preview-queue.ts";
import type { KeeperDB } from "../../src/db/types.ts";

describe("link metadata queue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not schedule polling after being stopped during startup", async () => {
    vi.useFakeTimers();
    let resolveScan: ((count: number) => void) | undefined;
    const scan = new Promise<number>((resolve) => {
      resolveScan = resolve;
    });
    const db = {
      enqueueMissingLinkMetadataJobs: vi.fn(() => scan),
    } as unknown as KeeperDB;
    const queue = createLinkMetadataQueue({
      db,
      log: { warn: vi.fn() } as never,
      broadcast: vi.fn(),
    });

    const started = queue.start();
    queue.stop();
    if (resolveScan === undefined) throw new Error("Scan promise resolver was not initialized");
    resolveScan(0);
    await started;

    expect(vi.getTimerCount()).toBe(0);
  });
});
