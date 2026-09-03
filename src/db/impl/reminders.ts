import type {
  KeeperDB,
  NoteId,
  Reminder,
  ReminderWithNote,
  SetReminderInput,
} from "../types.ts";
import { toNoteId } from "../types.ts";
import type { SqlRow } from "../sqlite-db.ts";
import type { KeeperDBContext } from "./context.ts";

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function createReminderMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  | "getReminder"
  | "getReminders"
  | "getReminderSummary"
  | "setReminder"
  | "deleteReminder"
  | "surfaceDueReminders"
  | "acknowledgeDueReminders"
  | "getNextReminderDueAt"
> {
  const { db, generateId, now, rowNumber, rowString, rowToNote, withTagsBatch } = ctx;

  function nullableNumber(row: SqlRow, key: string): number | null {
    const value = row[key];
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Expected ${key} to be a number or null`);
    }
    return value;
  }

  function rowToReminder(row: Parameters<typeof rowString>[0]): Reminder {
    return {
      id: rowString(row, "id"),
      note_id: toNoteId(rowString(row, "note_id")),
      due_at_utc_ms: rowNumber(row, "due_at_utc_ms"),
      scheduled_time_zone: rowString(row, "scheduled_time_zone"),
      scheduled_local: rowString(row, "scheduled_local"),
      surfaced_at_utc_ms: nullableNumber(row, "surfaced_at_utc_ms"),
      acknowledged_at_utc_ms: nullableNumber(row, "acknowledged_at_utc_ms"),
      created_at: rowString(row, "created_at"),
      updated_at: rowString(row, "updated_at"),
    };
  }

  function getReminderSync(noteId: NoteId): Reminder | null {
    const row = db.query("SELECT * FROM reminders WHERE note_id = ?", [noteId])[0];
    return row === undefined ? null : rowToReminder(row);
  }

  function validateInput(input: SetReminderInput): void {
    if (
      !Number.isSafeInteger(input.dueAtUtcMs) ||
      input.dueAtUtcMs < 0 ||
      Number.isNaN(new Date(input.dueAtUtcMs).getTime())
    ) {
      throw new Error("Reminder time must be a valid UTC timestamp");
    }

    if (!isValidLocalDateTime(input.scheduledLocal)) {
      throw new Error("Reminder local time must use YYYY-MM-DDTHH:mm");
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.scheduledTimeZone }).format(0);
    } catch {
      throw new Error("Reminder time zone must be a valid IANA time zone");
    }

    if (formatLocalDateTime(input.dueAtUtcMs, input.scheduledTimeZone) !== input.scheduledLocal) {
      throw new Error("Reminder time does not exist in the selected time zone");
    }

    const noteRow = db.query("SELECT trashed FROM notes WHERE id = ?", [input.noteId])[0];
    if (noteRow === undefined) throw new Error(`Note not found: ${String(input.noteId)}`);
    if (rowNumber(noteRow, "trashed") === 1) {
      throw new Error("Cannot add a reminder to a note in the trash");
    }
  }

  return {
    getReminder(noteId) {
      return Promise.resolve(getReminderSync(noteId));
    },

    getReminders(): Promise<ReminderWithNote[]> {
      const reminderRows = db.query(
        `SELECT r.*
         FROM reminders r
         JOIN notes n ON n.id = r.note_id
         WHERE n.trashed = 0
         ORDER BY
           CASE
             WHEN r.surfaced_at_utc_ms IS NOT NULL AND r.acknowledged_at_utc_ms IS NULL THEN 0
             WHEN r.surfaced_at_utc_ms IS NULL THEN 1
             ELSE 2
           END,
           CASE WHEN r.surfaced_at_utc_ms IS NULL THEN r.due_at_utc_ms END ASC,
           r.due_at_utc_ms DESC`,
      );
      if (reminderRows.length === 0) return Promise.resolve([]);

      const noteIds = reminderRows.map((row) => rowString(row, "note_id"));
      const placeholders = noteIds.map(() => "?").join(",");
      const noteRows = db.query(
        `SELECT * FROM notes WHERE id IN (${placeholders})`,
        noteIds,
      );
      const notesById = new Map(
        withTagsBatch(noteRows.map(rowToNote)).map((note) => [note.id, note]),
      );

      return Promise.resolve(reminderRows.map((row) => {
        const reminder = rowToReminder(row);
        const note = notesById.get(reminder.note_id);
        if (note === undefined) {
          throw new Error(`Reminder note not found: ${String(reminder.note_id)}`);
        }
        return { ...reminder, note };
      }));
    },

    getReminderSummary() {
      const row = db.query(
        `SELECT COUNT(*) AS count
         FROM reminders r
         JOIN notes n ON n.id = r.note_id
         WHERE n.trashed = 0
           AND r.surfaced_at_utc_ms IS NOT NULL
           AND r.acknowledged_at_utc_ms IS NULL`,
      )[0];
      return Promise.resolve({ unreadCount: row === undefined ? 0 : rowNumber(row, "count") });
    },

    setReminder(input) {
      validateInput(input);
      const timestamp = now();
      db.run(
        `INSERT INTO reminders (
           id, note_id, due_at_utc_ms, scheduled_time_zone, scheduled_local,
           surfaced_at_utc_ms, acknowledged_at_utc_ms, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
         ON CONFLICT(note_id) DO UPDATE SET
           due_at_utc_ms = excluded.due_at_utc_ms,
           scheduled_time_zone = excluded.scheduled_time_zone,
           scheduled_local = excluded.scheduled_local,
           surfaced_at_utc_ms = NULL,
           acknowledged_at_utc_ms = NULL,
           updated_at = excluded.updated_at`,
        [
          generateId(),
          input.noteId,
          input.dueAtUtcMs,
          input.scheduledTimeZone,
          input.scheduledLocal,
          timestamp,
          timestamp,
        ],
      );
      const reminder = getReminderSync(input.noteId);
      if (reminder === null) throw new Error("Reminder was not stored");
      return Promise.resolve(reminder);
    },

    deleteReminder(noteId) {
      db.run("DELETE FROM reminders WHERE note_id = ?", [noteId]);
      return Promise.resolve();
    },

    surfaceDueReminders(currentTimeUtcMs) {
      if (!Number.isSafeInteger(currentTimeUtcMs)) {
        throw new Error("Current time must be a valid UTC timestamp");
      }
      const surfacedCount = db.transaction(() => {
        const countRow = db.query(
          `SELECT COUNT(*) AS count
           FROM reminders r
           JOIN notes n ON n.id = r.note_id
           WHERE n.trashed = 0
             AND r.surfaced_at_utc_ms IS NULL
             AND r.due_at_utc_ms <= ?`,
          [currentTimeUtcMs],
        )[0];
        const count = countRow === undefined ? 0 : rowNumber(countRow, "count");
        if (count > 0) {
          db.run(
            `UPDATE reminders
             SET surfaced_at_utc_ms = ?
             WHERE surfaced_at_utc_ms IS NULL
               AND due_at_utc_ms <= ?
               AND EXISTS (
                 SELECT 1 FROM notes
                 WHERE notes.id = reminders.note_id AND notes.trashed = 0
               )`,
            [currentTimeUtcMs, currentTimeUtcMs],
          );
        }
        return count;
      });
      return Promise.resolve(surfacedCount);
    },

    acknowledgeDueReminders(currentTimeUtcMs) {
      if (!Number.isSafeInteger(currentTimeUtcMs)) {
        throw new Error("Current time must be a valid UTC timestamp");
      }
      const acknowledgedCount = db.transaction(() => {
        const countRow = db.query(
          `SELECT COUNT(*) AS count
           FROM reminders r
           JOIN notes n ON n.id = r.note_id
           WHERE n.trashed = 0
             AND r.surfaced_at_utc_ms IS NOT NULL
             AND r.acknowledged_at_utc_ms IS NULL`,
        )[0];
        const count = countRow === undefined ? 0 : rowNumber(countRow, "count");
        if (count > 0) {
          db.run(
            `UPDATE reminders
             SET acknowledged_at_utc_ms = ?
             WHERE surfaced_at_utc_ms IS NOT NULL
               AND acknowledged_at_utc_ms IS NULL
               AND EXISTS (
                 SELECT 1 FROM notes
                 WHERE notes.id = reminders.note_id AND notes.trashed = 0
               )`,
            [currentTimeUtcMs],
          );
        }
        return count;
      });
      return Promise.resolve(acknowledgedCount);
    },

    getNextReminderDueAt() {
      const row = db.query(
        `SELECT MIN(r.due_at_utc_ms) AS due_at_utc_ms
         FROM reminders r
         JOIN notes n ON n.id = r.note_id
         WHERE n.trashed = 0 AND r.surfaced_at_utc_ms IS NULL`,
      )[0];
      if (row === undefined) return Promise.resolve(null);
      return Promise.resolve(nullableNumber(row, "due_at_utc_ms"));
    },
  };
}

function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() + 1 === month &&
    candidate.getUTCDate() === day &&
    candidate.getUTCHours() === hour &&
    candidate.getUTCMinutes() === minute;
}

function formatLocalDateTime(utcMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year") ?? ""}-${values.get("month") ?? ""}-${values.get("day") ?? ""}T${values.get("hour") ?? ""}:${values.get("minute") ?? ""}`;
}
