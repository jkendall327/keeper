import type { FastifyBaseLogger } from "fastify";
import type { KeeperDB } from "../src/db/types.ts";
import type { BroadcastFn } from "./events.ts";

const MAX_RECHECK_DELAY_MS = 60_000;

export function createReminderScheduler(params: {
  db: KeeperDB;
  log: FastifyBaseLogger;
  broadcast: BroadcastFn;
  now?: () => number;
}) {
  const { db, log, broadcast } = params;
  const now = params.now ?? Date.now;
  let stopped = true;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function processDue(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const surfacedCount = await db.surfaceDueReminders(now());
      if (surfacedCount > 0) broadcast("reminders-due");
    } catch (error) {
      log.warn({ error }, "Failed to surface due reminders");
    } finally {
      running = false;
    }
  }

  async function scheduleNext(): Promise<void> {
    if (stopped || timer !== null) return;
    let delay = MAX_RECHECK_DELAY_MS;
    try {
      const nextDueAt = await db.getNextReminderDueAt();
      if (nextDueAt !== null) {
        delay = Math.min(MAX_RECHECK_DELAY_MS, Math.max(0, nextDueAt - now()));
      }
    } catch (error) {
      log.warn({ error }, "Failed to schedule next reminder check");
    }

    timer = setTimeout(() => {
      timer = null;
      void processDue().finally(() => { void scheduleNext(); });
    }, delay);
  }

  function reschedule(delay = 0): void {
    if (stopped) return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    timer = setTimeout(() => {
      timer = null;
      void processDue().finally(() => { void scheduleNext(); });
    }, delay);
  }

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      reschedule();
    },

    scheduleChanged(): void {
      reschedule();
    },

    stop(): void {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
