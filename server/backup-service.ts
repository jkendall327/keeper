import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CURRENT_SCHEMA_VERSION, migrate } from "../src/db/migrations.ts";
import type { SqlRow } from "../src/db/sqlite-db.ts";
import { createKeeperArchive, readKeeperArchive, type ArchiveEntry } from "./keeper-archive.ts";
import { createSqliteAdapter, type ServerSqliteAdapter } from "./sqlite-adapter.ts";

export interface BackupManifest {
  app: "keeper";
  formatVersion: 1;
  createdAt: string;
  schemaVersion: number;
  includesMedia: boolean;
  counts: {
    notes: number;
    tags: number;
    media: number;
  };
}

export interface BackupService {
  createBackup(input?: { includeMedia?: boolean; saveCopy?: boolean; filenamePrefix?: string }): Promise<Buffer>;
  restoreBackup(input: { archive: Buffer }): Promise<{ preRestoreBackupPath: string }>;
}

export interface BackupServiceOptions {
  dataDir: string;
  mediaDir: string;
  db: ServerSqliteAdapter;
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  const { dataDir, mediaDir, db } = options;
  const backupDir = join(dataDir, "backups");

  return {
    async createBackup(input = {}) {
      const includeMedia = input.includeMedia ?? true;
      const archive = await createBackupArchive({
        db,
        mediaDir,
        includeMedia,
        createdAt: new Date().toISOString(),
      });
      if (input.saveCopy === true) {
        await mkdir(backupDir, { recursive: true });
        const prefix = input.filenamePrefix ?? "keeper-backup";
        const path = join(backupDir, `${prefix}-${backupFilenameStamp()}-${randomUUID()}.keeper.zip`);
        await writeFile(path, archive);
      }
      return archive;
    },

    async restoreBackup(input) {
      const tempDir = await mkdtemp(join(tmpdir(), "keeper-restore-"));
      await mkdir(backupDir, { recursive: true });

      try {
        const entries = readKeeperArchive(input.archive);
        parseManifest(entries.get("manifest.json"));

        const databaseBuffer = entries.get("keeper.sqlite3");
        if (databaseBuffer === undefined) {
          throw new Error("Backup archive is missing keeper.sqlite3");
        }

        const restoredDbPath = join(tempDir, "keeper.sqlite3");
        await writeFile(restoredDbPath, databaseBuffer);
        validateAndMigrateDatabase(restoredDbPath);

        const restoredMediaDir = join(tempDir, "media");
        await mkdir(restoredMediaDir, { recursive: true });
        for (const [path, data] of entries) {
          if (!path.startsWith("media/")) continue;
          const filename = basename(path);
          assertSafeMediaFilename(filename);
          await writeFile(join(restoredMediaDir, filename), data);
        }

        const preRestoreBackupPath = join(
          backupDir,
          `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.keeper.zip`,
        );
        await writeFile(preRestoreBackupPath, await this.createBackup());

        await db.replaceDatabase(restoredDbPath);
        migrate(db);
        await rm(mediaDir, { recursive: true, force: true });
        await mkdir(mediaDir, { recursive: true });
        await copyMediaFiles(restoredMediaDir, mediaDir);

        return { preRestoreBackupPath };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}

function backupFilenameStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function createBackupArchive(input: {
  db: ServerSqliteAdapter;
  mediaDir: string;
  includeMedia: boolean;
  createdAt: string;
}): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "keeper-backup-"));
  const snapshotPath = join(tempDir, "keeper.sqlite3");

  try {
    await input.db.backup(snapshotPath);
    const entries: ArchiveEntry[] = [
      {
        path: "manifest.json",
        data: Buffer.from(JSON.stringify(createManifest(input), null, 2)),
      },
      {
        path: "keeper.sqlite3",
        data: await readFile(snapshotPath),
      },
    ];

    if (input.includeMedia) {
      const rows = input.db.query("SELECT filename FROM media ORDER BY filename");
      for (const row of rows) {
        const filename = String(row["filename"]);
        assertSafeMediaFilename(filename);
        try {
          entries.push({
            path: `media/${filename}`,
            data: await readFile(join(input.mediaDir, filename)),
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }

    return createKeeperArchive(entries);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createManifest(input: {
  db: ServerSqliteAdapter;
  includeMedia: boolean;
  createdAt: string;
}): BackupManifest {
  return {
    app: "keeper",
    formatVersion: 1,
    createdAt: input.createdAt,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    includesMedia: input.includeMedia,
    counts: {
      notes: countRows(input.db.query("SELECT COUNT(*) AS count FROM notes")[0]),
      tags: countRows(input.db.query("SELECT COUNT(*) AS count FROM tags")[0]),
      media: countRows(input.db.query("SELECT COUNT(*) AS count FROM media")[0]),
    },
  };
}

function countRows(row: SqlRow | undefined): number {
  const value = row?.["count"];
  if (typeof value !== "number") throw new Error("Unable to count backup records");
  return value;
}

function parseManifest(buffer: Buffer | undefined): BackupManifest {
  if (buffer === undefined) throw new Error("Backup archive is missing manifest.json");
  const parsed = JSON.parse(buffer.toString("utf8")) as {
    app?: unknown;
    formatVersion?: unknown;
    createdAt?: unknown;
    schemaVersion?: unknown;
    includesMedia?: unknown;
    counts?: unknown;
  };
  if (parsed.app !== "keeper" || parsed.formatVersion !== 1) {
    throw new Error("Backup archive manifest is invalid");
  }
  if (
    typeof parsed.createdAt !== "string" ||
    typeof parsed.schemaVersion !== "number" ||
    typeof parsed.includesMedia !== "boolean" ||
    !isManifestCounts(parsed.counts)
  ) {
    throw new Error("Backup archive manifest is incomplete");
  }
  return {
    app: "keeper",
    formatVersion: 1,
    createdAt: parsed.createdAt,
    schemaVersion: parsed.schemaVersion,
    includesMedia: parsed.includesMedia,
    counts: parsed.counts,
  };
}

function isManifestCounts(value: unknown): value is BackupManifest["counts"] {
  if (typeof value !== "object" || value === null) return false;
  const counts = value as Record<string, unknown>;
  return (
    typeof counts["notes"] === "number" &&
    typeof counts["tags"] === "number" &&
    typeof counts["media"] === "number"
  );
}

function validateAndMigrateDatabase(path: string) {
  const adapter = createSqliteAdapter(path);
  try {
    migrate(adapter);
    adapter.close();

    const db = new Database(path, { readonly: true });
    try {
      const integrity = db.prepare("PRAGMA integrity_check").pluck().all();
      if (integrity.length !== 1 || integrity[0] !== "ok") {
        throw new Error("Backup database failed integrity_check");
      }
      const foreignKeyRows = db.prepare("PRAGMA foreign_key_check").all();
      if (foreignKeyRows.length > 0) {
        throw new Error("Backup database failed foreign_key_check");
      }
    } finally {
      db.close();
    }
  } finally {
    try {
      adapter.close();
    } catch {
      // Already closed after migration.
    }
  }
}

async function copyMediaFiles(sourceDir: string, destinationDir: string) {
  const filenames = await readdir(sourceDir);
  for (const filename of filenames) {
    assertSafeMediaFilename(filename);
    await copyFile(join(sourceDir, filename), join(destinationDir, filename));
  }
}

function assertSafeMediaFilename(filename: string) {
  if (
    filename === "" ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error(`Invalid media filename in backup: ${filename}`);
  }
}
