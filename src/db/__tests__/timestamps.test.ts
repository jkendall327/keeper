import { describe, expect, it } from 'vitest';
import { formatSqliteTimestamp } from '../timestamps.ts';

describe('formatSqliteTimestamp', () => {
  it('uses the existing SQLite timestamp format with millisecond precision', () => {
    expect(formatSqliteTimestamp(new Date('2025-01-15T12:34:56.789Z'))).toBe(
      '2025-01-15 12:34:56.789',
    );
  });

  it('sorts new values correctly alongside legacy second-precision values', () => {
    const timestamps = [
      '2025-01-15 12:34:56.875',
      '2025-01-15 12:34:56',
      '2025-01-15 12:34:56.125',
    ];

    expect([...timestamps].sort()).toEqual([
      '2025-01-15 12:34:56',
      '2025-01-15 12:34:56.125',
      '2025-01-15 12:34:56.875',
    ]);
  });
});
