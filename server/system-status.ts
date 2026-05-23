import { access, mkdir, readdir, stat, writeFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { CURRENT_SCHEMA_VERSION } from "../src/db/migrations.ts";
import type { SqlRow } from "../src/db/sqlite-db.ts";
import type { HealthStatus, SystemCheck, SystemStatus, SystemStatusLevel } from "../src/system-status.ts";
import { readGitSha, readPackageVersion } from "../app-metadata.ts";
import type { ServerSqliteAdapter } from "./sqlite-adapter.ts";

export interface SystemStatusService {
  getStatus(): Promise<SystemStatus>;
  getHealth(): Promise<HealthStatus>;
  runStartupChecks(): Promise<void>;
}

export interface SystemStatusServiceOptions {
  dataDir: string;
  mediaDir: string;
  backupDir: string;
  databasePath: string;
  db: ServerSqliteAdapter;
}

export function createSystemStatusService(options: SystemStatusServiceOptions): SystemStatusService {
  const startedAt = new Date();
  const appVersion = readPackageVersion();
  const gitSha = readGitSha();
  const paths = {
    dataDir: resolve(options.dataDir),
    mediaDir: resolve(options.mediaDir),
    backupDir: resolve(options.backupDir),
    databasePath: resolve(options.databasePath),
  };

  async function getStatus(): Promise<SystemStatus> {
    const [pathChecks, backupSummary] = await Promise.all([
      checkPaths(paths),
      summarizeBackups(paths.backupDir),
    ]);
    const database = await getDatabaseStatus(options.db, paths.databasePath);
    const counts = getCounts(options.db);
    const checks = [
      ...pathChecks,
      checkMigration(database.schemaVersion),
      {
        id: "database-integrity",
        label: "SQLite integrity",
        status: database.integrity === "ok" ? "ok" : "error",
        message: database.integrity === "ok" ? "integrity_check passed" : "integrity_check failed",
      } satisfies SystemCheck,
      {
        id: "database-foreign-keys",
        label: "SQLite foreign keys",
        status: database.foreignKeys === "ok" ? "ok" : "error",
        message: database.foreignKeys === "ok" ? "foreign_key_check passed" : "foreign_key_check failed",
      } satisfies SystemCheck,
    ];

    return {
      status: statusFromChecks(checks),
      app: {
        version: appVersion,
        gitSha,
        nodeVersion: process.version,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      },
      paths,
      database,
      counts,
      backups: backupSummary,
      checks,
    };
  }

  return {
    getStatus,

    async getHealth() {
      const status = await getStatus();
      return {
        status: status.status,
        version: status.app.version,
        gitSha: status.app.gitSha,
        schemaVersion: status.database.schemaVersion,
        currentSchemaVersion: status.database.currentSchemaVersion,
        uptimeSeconds: status.app.uptimeSeconds,
        checks: status.checks,
      };
    },

    async runStartupChecks() {
      await mkdir(paths.dataDir, { recursive: true });
      await mkdir(paths.mediaDir, { recursive: true });
      await mkdir(paths.backupDir, { recursive: true });
      const status = await getStatus();
      const failures = status.checks.filter((check) => check.status === "error");
      if (failures.length > 0) {
        throw new Error(
          `Keeper startup checks failed: ${failures.map((check) => `${check.label}: ${check.message}`).join("; ")}`,
        );
      }
    },
  };
}

async function checkPaths(paths: SystemStatus["paths"]): Promise<SystemCheck[]> {
  return Promise.all([
    checkDirectory("data-dir", "Data directory", paths.dataDir),
    checkDirectory("media-dir", "Media directory", paths.mediaDir),
    checkDirectory("backup-dir", "Backup directory", paths.backupDir),
  ]);
}

async function checkDirectory(id: string, label: string, path: string): Promise<SystemCheck> {
  try {
    await mkdir(path, { recursive: true });
    await access(path, constants.R_OK | constants.W_OK);
    const probePath = join(path, `.keeper-write-check-${String(process.pid)}`);
    await writeFile(probePath, "ok");
    await rm(probePath, { force: true });
    return { id, label, status: "ok", message: `${path} is readable and writable` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "directory check failed";
    return { id, label, status: "error", message };
  }
}

async function getDatabaseStatus(db: ServerSqliteAdapter, databasePath: string): Promise<SystemStatus["database"]> {
  const schemaVersion = getUserVersion(db);
  const integrityRows = db.query("PRAGMA integrity_check");
  const foreignKeyRows = db.query("PRAGMA foreign_key_check");
  const [sizeBytes, walSizeBytes, shmSizeBytes] = await Promise.all([
    fileSize(databasePath),
    fileSize(`${databasePath}-wal`),
    fileSize(`${databasePath}-shm`),
  ]);

  return {
    schemaVersion,
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    migrationState: getMigrationState(schemaVersion),
    integrity: integrityRows.length === 1 && integrityRows[0]?.["integrity_check"] === "ok" ? "ok" : "error",
    foreignKeys: foreignKeyRows.length === 0 ? "ok" : "error",
    sizeBytes,
    walSizeBytes,
    shmSizeBytes,
    totalSizeBytes: sizeBytes + walSizeBytes + shmSizeBytes,
  };
}

function getUserVersion(db: ServerSqliteAdapter): number {
  return rowNumber(db.query("PRAGMA user_version")[0], "user_version");
}

function getMigrationState(schemaVersion: number): SystemStatus["database"]["migrationState"] {
  if (schemaVersion < CURRENT_SCHEMA_VERSION) return "behind";
  if (schemaVersion > CURRENT_SCHEMA_VERSION) return "ahead";
  return "current";
}

function checkMigration(schemaVersion: number): SystemCheck {
  const state = getMigrationState(schemaVersion);
  if (state === "current") {
    return {
      id: "database-migration",
      label: "SQLite schema",
      status: "ok",
      message: `schema version ${String(schemaVersion)} is current`,
    };
  }

  return {
    id: "database-migration",
    label: "SQLite schema",
    status: "error",
    message: `schema version ${String(schemaVersion)} is ${state}; expected ${String(CURRENT_SCHEMA_VERSION)}`,
  };
}

function getCounts(db: ServerSqliteAdapter): SystemStatus["counts"] {
  return {
    notes: count(db, "notes"),
    tags: count(db, "tags"),
    media: count(db, "media"),
    linkMetadataJobs: count(db, "link_metadata_jobs"),
  };
}

function count(db: ServerSqliteAdapter, tableName: string): number {
  return rowNumber(db.query(`SELECT COUNT(*) AS count FROM ${tableName}`)[0], "count");
}

function rowNumber(row: SqlRow | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value !== "number") throw new Error(`Expected ${key} to be a number`);
  return value;
}

async function summarizeBackups(backupDir: string): Promise<SystemStatus["backups"]> {
  try {
    await mkdir(backupDir, { recursive: true });
    const entries = await readdir(backupDir);
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".keeper.zip"))
        .map(async (filename) => {
          const path = join(backupDir, filename);
          const details = await stat(path);
          return {
            filename,
            path,
            sizeBytes: details.size,
            modifiedAt: details.mtime.toISOString(),
            mtimeMs: details.mtimeMs,
          };
        }),
    );
    backups.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return {
      backupCount: backups.length,
      totalSizeBytes: backups.reduce((total, backup) => total + backup.sizeBytes, 0),
      lastBackup: backups[0] === undefined
        ? null
        : {
            filename: backups[0].filename,
            path: backups[0].path,
            sizeBytes: backups[0].sizeBytes,
            modifiedAt: backups[0].modifiedAt,
          },
    };
  } catch {
    return {
      backupCount: 0,
      totalSizeBytes: 0,
      lastBackup: null,
    };
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

function statusFromChecks(checks: SystemCheck[]): SystemStatusLevel {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}
