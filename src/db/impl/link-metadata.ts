import type { KeeperDB, LinkMetadata, LinkMetadataJob } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 60 * 60, 24 * 60 * 60];

export function createLinkMetadataMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  | "getLinkMetadata"
  | "upsertLinkMetadata"
  | "enqueueLinkMetadataJobsForUrls"
  | "enqueueMissingLinkMetadataJobs"
  | "claimNextLinkMetadataJob"
  | "completeLinkMetadataJob"
  | "failLinkMetadataJob"
> {
  const { db, getLinkMetadataSync, now, rowNullableString, rowNumber, rowString } = ctx;

  function normalizeMetadataInput(
    input: Partial<LinkMetadata> & Pick<LinkMetadata, "url" | "status">,
  ) {
    const timestamp = now();
    return {
      url: input.url,
      image_url: input.image_url ?? null,
      image_alt: input.image_alt ?? null,
      image_width: input.image_width ?? null,
      image_height: input.image_height ?? null,
      title: input.title ?? null,
      site_name: input.site_name ?? null,
      canonical_url: input.canonical_url ?? null,
      type: input.type ?? null,
      status: input.status,
      failure_reason: input.failure_reason ?? null,
      fetched_at: timestamp,
      updated_at: timestamp,
    };
  }

  function upsertSync(
    input: Partial<LinkMetadata> & Pick<LinkMetadata, "url" | "status">,
  ): LinkMetadata {
    const metadata = normalizeMetadataInput(input);
    db.run(
      `INSERT INTO link_metadata (
        url, image_url, image_alt, image_width, image_height, title, site_name,
        canonical_url, type, status, failure_reason, fetched_at, updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         image_url = excluded.image_url,
         image_alt = excluded.image_alt,
         image_width = excluded.image_width,
         image_height = excluded.image_height,
         title = excluded.title,
         site_name = excluded.site_name,
         canonical_url = excluded.canonical_url,
         type = excluded.type,
         status = excluded.status,
         failure_reason = excluded.failure_reason,
         fetched_at = excluded.fetched_at,
         updated_at = excluded.updated_at`,
      [
        metadata.url,
        metadata.image_url,
        metadata.image_alt,
        metadata.image_width,
        metadata.image_height,
        metadata.title,
        metadata.site_name,
        metadata.canonical_url,
        metadata.type,
        metadata.status,
        metadata.failure_reason,
        metadata.fetched_at,
        metadata.updated_at,
      ],
    );
    const stored = getLinkMetadataSync(input.url);
    if (stored === null) throw new Error("Failed to store link metadata");
    return stored;
  }

  function enqueueUrls(urls: string[], options?: { includeFound: boolean }): number {
    let inserted = 0;
    const timestamp = now();
    for (const url of Array.from(new Set(urls))) {
      if (options?.includeFound !== true) {
        const existing = db.query(
          "SELECT 1 FROM link_metadata WHERE url = ? AND status = 'found'",
          [url],
        )[0];
        if (existing !== undefined) continue;
      }
      const existingJob = db.query("SELECT 1 FROM link_metadata_jobs WHERE url = ?", [url])[0];
      if (existingJob !== undefined) continue;
      db.run(
        `INSERT INTO link_metadata_jobs (url, next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [url, timestamp, timestamp, timestamp],
      );
      inserted += 1;
    }
    return inserted;
  }

  return {
    getLinkMetadata(url: string): Promise<LinkMetadata | null> {
      return Promise.resolve(getLinkMetadataSync(url));
    },

    upsertLinkMetadata(input): Promise<LinkMetadata> {
      return Promise.resolve(upsertSync(input));
    },

    enqueueLinkMetadataJobsForUrls(urls: string[]): Promise<number> {
      return Promise.resolve(enqueueUrls(urls));
    },

    enqueueMissingLinkMetadataJobs(): Promise<number> {
      const rows = db.query(
        `SELECT DISTINCT nl.url
         FROM note_links nl
         LEFT JOIN link_metadata lm ON lm.url = nl.url
         WHERE lm.url IS NULL
            OR lm.status IN ('missing', 'error')
            OR lm.fetched_at <= datetime('now', '-7 days')`,
      );
      return Promise.resolve(
        enqueueUrls(rows.map((row) => rowString(row, "url")), { includeFound: true }),
      );
    },

    claimNextLinkMetadataJob(currentTime: string): Promise<LinkMetadataJob | null> {
      const row = db.query(
        `SELECT url, attempts, next_run_at, last_error
         FROM link_metadata_jobs
         WHERE next_run_at <= ?
         ORDER BY next_run_at, created_at
         LIMIT 1`,
        [currentTime],
      )[0];
      if (row === undefined) return Promise.resolve(null);
      return Promise.resolve({
        url: rowString(row, "url"),
        attempts: rowNumber(row, "attempts"),
        next_run_at: rowString(row, "next_run_at"),
        last_error: rowNullableString(row, "last_error"),
      });
    },

    completeLinkMetadataJob(input): Promise<LinkMetadata> {
      const stored = upsertSync(input);
      db.run("DELETE FROM link_metadata_jobs WHERE url = ?", [input.url]);
      return Promise.resolve(stored);
    },

    failLinkMetadataJob(url: string, error: string): Promise<void> {
      const row = db.query(
        "SELECT attempts FROM link_metadata_jobs WHERE url = ?",
        [url],
      )[0];
      const attempts = row === undefined ? 1 : rowNumber(row, "attempts") + 1;
      const delay = RETRY_DELAYS_SECONDS[Math.min(attempts - 1, RETRY_DELAYS_SECONDS.length - 1)] ?? RETRY_DELAYS_SECONDS.at(-1) ?? 60;
      const nextRun = new Date(Date.parse(`${now()}Z`) + delay * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      db.run(
        `INSERT INTO link_metadata_jobs (url, attempts, next_run_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET
           attempts = excluded.attempts,
           next_run_at = excluded.next_run_at,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
        [url, attempts, nextRun, error, now(), now()],
      );
      upsertSync({ url, status: "error", image_url: null, failure_reason: error });
      return Promise.resolve();
    },

  };
}
