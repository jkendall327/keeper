import { join } from "node:path";
import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { createSqliteAdapter } from "./sqlite-adapter.ts";
import { createMediaHandler } from "./media-handler.ts";
import { registerRoutes } from "./routes.ts";
import { createKeeperDB } from "../src/db/db-impl.ts";
import { randomUUID } from "node:crypto";

const dataDir = process.env["DATA_DIR"] ?? "./data";
const port = Number(process.env["PORT"] ?? "3001");

const app = Fastify({ logger: true });

await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// Initialize database
const adapter = createSqliteAdapter(join(dataDir, "keeper.sqlite3"));
const keeperDb = createKeeperDB({
  db: adapter,
  generateId: () => randomUUID(),
  now: () => new Date().toISOString().replace("T", " ").slice(0, 19),
});

// Set up filesystem-backed media, overriding the base DB stubs
const mediaDir = join(dataDir, "media");
const origDeleteNote = keeperDb.deleteNote.bind(keeperDb);
const media = await createMediaHandler(mediaDir, adapter, origDeleteNote);

keeperDb.storeMedia = media.storeMedia.bind(media);
keeperDb.deleteMedia = media.deleteMedia.bind(media);
keeperDb.deleteNote = media.deleteNoteWithMedia.bind(media);
keeperDb.getMedia = async (id: string) => {
  const result = await media.serveMedia(id);
  if (result === null) return null;
  const { buffer } = result;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};

// Register API routes
registerRoutes(app, keeperDb, media);

// Serve built frontend
const distDir = join(import.meta.dirname, "..", "dist");
await app.register(fastifyStatic, {
  root: distDir,
  wildcard: false,
});

// SPA fallback: serve index.html for non-API routes
app.setNotFoundHandler(async (req, reply) => {
  if (req.url.startsWith("/api/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  return reply.sendFile("index.html");
});

await app.listen({ host: "0.0.0.0", port });
