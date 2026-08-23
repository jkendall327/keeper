const SQLITE_TIMESTAMP_LENGTH_WITH_MILLISECONDS = 23;

export function formatSqliteTimestamp(date = new Date()): string {
  return date
    .toISOString()
    .replace("T", " ")
    .slice(0, SQLITE_TIMESTAMP_LENGTH_WITH_MILLISECONDS);
}
