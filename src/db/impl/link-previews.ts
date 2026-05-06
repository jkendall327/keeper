import type { KeeperDB, LinkPreview } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createLinkPreviewMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  "getLinkPreview" | "upsertLinkPreview"
> {
  const { db, getLinkPreviewSync, now } = ctx;

  return {
    getLinkPreview(url: string): Promise<LinkPreview | null> {
      return Promise.resolve(getLinkPreviewSync(url));
    },

    upsertLinkPreview(input): Promise<LinkPreview> {
      const timestamp = now();
      db.run(
        `INSERT INTO link_previews (url, image_url, status, fetched_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET
           image_url = excluded.image_url,
           status = excluded.status,
           fetched_at = excluded.fetched_at,
           updated_at = excluded.updated_at`,
        [input.url, input.image_url, input.status, timestamp, timestamp],
      );
      const preview = getLinkPreviewSync(input.url);
      if (preview === null) throw new Error("Failed to store link preview");
      return Promise.resolve(preview);
    },
  };
}
