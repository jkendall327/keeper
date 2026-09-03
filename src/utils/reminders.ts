const pad = (value: number) => String(value).padStart(2, '0');

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
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    year === undefined || month === undefined || day === undefined ||
    hour === undefined || minute === undefined
  ) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return toLocalDateTimeInput(date.getTime()) === value ? date.getTime() : null;
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
