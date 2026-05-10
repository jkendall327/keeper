import type { FastifyBaseLogger } from "fastify";
import type { KeeperDB } from "../src/db/types.ts";
import { extractUrls } from "../src/db/url-detect.ts";
import { fetchLinkMetadata } from "./link-preview.ts";
import type { BroadcastFn } from "./events.ts";

const POLL_INTERVAL_MS = 1000;

export function createLinkMetadataQueue(params: {
  db: KeeperDB;
  log: FastifyBaseLogger;
  broadcast: BroadcastFn;
  now?: () => string;
}) {
  const { db, log, broadcast } = params;
  const now = params.now ?? (() => new Date().toISOString().replace("T", " ").slice(0, 19));
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function processNext(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const settings = await db.getAppSettings();
      if (!settings.linkPreviewFetchEnabled) return;

      const job = await db.claimNextLinkMetadataJob(now());
      if (job === null) return;

      const existing = await db.getLinkMetadata(job.url);
      const result = await fetchLinkMetadata(job.url);
      if (result.status === "error") {
        await db.failLinkMetadataJob(job.url, result.failure_reason ?? "Unable to fetch link metadata");
        return;
      }

      const metadata = await db.completeLinkMetadataJob(result);
      if (
        metadata.status === "found" &&
        metadata.image_url !== null &&
        existing?.image_url !== metadata.image_url
      ) {
        broadcast("refresh");
      }
    } catch (error) {
      log.warn({ error }, "Failed to process link metadata job");
    } finally {
      running = false;
    }
  }

  function schedule(delay = 0): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void processNext().finally(() => { schedule(POLL_INTERVAL_MS); });
    }, delay);
  }

  return {
    async enqueueFromBody(body: string): Promise<void> {
      const count = await db.enqueueLinkMetadataJobsForUrls(extractUrls(body));
      if (count > 0) schedule();
    },

    async start(): Promise<void> {
      await db.enqueueMissingLinkMetadataJobs();
      schedule();
    },

    stop(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export const createLinkPreviewQueue = createLinkMetadataQueue;
