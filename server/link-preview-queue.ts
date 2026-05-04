import type { FastifyBaseLogger } from "fastify";
import type { KeeperDB } from "../src/db/types.ts";
import { extractSingleUrl } from "../src/db/url-detect.ts";
import { fetchOgImage } from "./link-preview.ts";
import type { BroadcastFn } from "./events.ts";

export function createLinkPreviewQueue(params: {
  db: KeeperDB;
  log: FastifyBaseLogger;
  broadcast: BroadcastFn;
}) {
  const { db, log, broadcast } = params;

  return function queueLinkPreview(body: string) {
    const url = extractSingleUrl(body);
    if (url === null) return;

    void (async () => {
      try {
        const settings = await db.getAppSettings();
        if (!settings.linkPreviewFetchEnabled) return;
        const existing = await db.getLinkPreview(url);
        if (existing !== null) return;
        const result = await fetchOgImage(url);
        await db.upsertLinkPreview({
          url,
          image_url: result.imageUrl,
          status: result.status,
        });
        if (result.status === "found") broadcast("refresh");
      } catch (error) {
        log.warn({ error, url }, "Failed to fetch link preview");
      }
    })();
  };
}
