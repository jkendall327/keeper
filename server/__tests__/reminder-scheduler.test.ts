import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeeperDB } from '../../src/db/types.ts';
import { createReminderScheduler } from '../reminder-scheduler.ts';

describe('reminder scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks immediately on startup, wakes at the next due instant, and broadcasts once', async () => {
    vi.useFakeTimers();
    let currentTime = 1_000;
    let surfaced = false;
    const surfaceDueReminders = vi.fn((now: number) => {
        if (!surfaced && now >= 1_500) {
          surfaced = true;
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      });
    const db = {
      surfaceDueReminders,
      getNextReminderDueAt: vi.fn(() => Promise.resolve(surfaced ? null : 1_500)),
    } as unknown as KeeperDB;
    const broadcast = vi.fn();
    const scheduler = createReminderScheduler({
      db,
      log: { warn: vi.fn() } as never,
      broadcast,
      now: () => currentTime,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(surfaceDueReminders).toHaveBeenLastCalledWith(1_000);

    currentTime = 1_499;
    await vi.advanceTimersByTimeAsync(499);
    expect(broadcast).not.toHaveBeenCalled();

    currentTime = 1_500;
    await vi.advanceTimersByTimeAsync(1);
    expect(surfaceDueReminders).toHaveBeenLastCalledWith(1_500);
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith('reminders-due');

    scheduler.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reschedules promptly when a reminder changes', async () => {
    vi.useFakeTimers();
    const surfaceDueReminders = vi.fn(() => Promise.resolve(0));
    const db = {
      surfaceDueReminders,
      getNextReminderDueAt: vi.fn(() => Promise.resolve(null)),
    } as unknown as KeeperDB;
    const scheduler = createReminderScheduler({
      db,
      log: { warn: vi.fn() } as never,
      broadcast: vi.fn(),
      now: () => 1_000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(surfaceDueReminders).toHaveBeenCalledTimes(1);

    scheduler.scheduleChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(surfaceDueReminders).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
