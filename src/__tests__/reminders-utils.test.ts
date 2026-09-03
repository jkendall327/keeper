import { describe, expect, it } from 'vitest';
import {
  formatZonedLocalDateTimeInput,
  parseZonedLocalDateTimeInput,
} from '../utils/reminders.ts';

describe('reminder date-time utilities', () => {
  it('resolves local wall times using the supplied IANA time zone', () => {
    expect(parseZonedLocalDateTimeInput('2026-07-01T09:00', 'America/New_York'))
      .toBe(Date.UTC(2026, 6, 1, 13, 0));
    expect(parseZonedLocalDateTimeInput('2026-01-01T09:00', 'America/New_York'))
      .toBe(Date.UTC(2026, 0, 1, 14, 0));
  });

  it('rejects wall times skipped by a daylight-saving transition', () => {
    expect(parseZonedLocalDateTimeInput('2026-03-08T02:30', 'America/New_York'))
      .toBeNull();
  });

  it('preserves the preferred instant for an ambiguous or unchanged wall time', () => {
    const laterOccurrence = Date.UTC(2026, 10, 1, 6, 30);
    expect(formatZonedLocalDateTimeInput(laterOccurrence, 'America/New_York'))
      .toBe('2026-11-01T01:30');
    expect(parseZonedLocalDateTimeInput(
      '2026-11-01T01:30',
      'America/New_York',
      laterOccurrence,
    )).toBe(laterOccurrence);
  });

  it('rejects invalid time zones and malformed local values', () => {
    expect(parseZonedLocalDateTimeInput('2026-07-01T09:00', 'Not/A_Zone')).toBeNull();
    expect(parseZonedLocalDateTimeInput('2026-02-30T09:00', 'UTC')).toBeNull();
  });
});
