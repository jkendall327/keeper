const pad = (value: number) => String(value).padStart(2, '0');
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function toLocalDateTimeInput(utcMs: number): string {
  const date = new Date(utcMs);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultReminderDateTimeInput(now = Date.now()): string {
  const date = new Date(now + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return toLocalDateTimeInput(date.getTime());
}

export function parseLocalDateTimeInput(value: string): number | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    year === undefined || month === undefined || day === undefined ||
    hour === undefined || minute === undefined
  ) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return toLocalDateTimeInput(date.getTime()) === value ? date.getTime() : null;
}

export function parseZonedLocalDateTimeInput(
  value: string,
  timeZone: string,
  preferredUtcMs?: number,
): number | null {
  const wallTimeUtcMs = parseWallTimeAsUtc(value);
  if (wallTimeUtcMs === null) return null;

  try {
    if (
      preferredUtcMs !== undefined &&
      formatZonedLocalDateTimeInput(preferredUtcMs, timeZone) === value
    ) {
      return preferredUtcMs;
    }

    const probeOffsets = [-48, -24, 0, 24, 48].map((hours) => (
      getTimeZoneOffsetMs(wallTimeUtcMs + hours * 60 * 60 * 1000, timeZone)
    ));
    const candidates = [...new Set(probeOffsets)]
      .map((offset) => wallTimeUtcMs - offset)
      .filter((candidate) => formatZonedLocalDateTimeInput(candidate, timeZone) === value)
      .sort((a, b) => a - b);
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

export function formatZonedLocalDateTimeInput(utcMs: number, timeZone: string): string {
  const values = zonedDateTimeParts(utcMs, timeZone);
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function currentTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone === '' ? 'UTC' : timeZone;
}

export function formatReminderDateTime(utcMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(utcMs));
}

function parseWallTimeAsUtc(value: string): number | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    year === undefined || month === undefined || day === undefined ||
    hour === undefined || minute === undefined
  ) return null;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(utcMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) return null;
  return utcMs;
}

function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const values = zonedDateTimeParts(utcMs, timeZone);
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
  ) - utcMs;
}

function zonedDateTimeParts(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  const hour = values.get('hour');
  const minute = values.get('minute');
  if (
    year === undefined || month === undefined || day === undefined ||
    hour === undefined || minute === undefined
  ) {
    throw new Error('Unable to format date in time zone');
  }
  return { year, month, day, hour, minute };
}
