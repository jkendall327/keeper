export type SystemStatusLevel = 'ok' | 'warning' | 'error';

export interface SystemCheck {
  id: string;
  label: string;
  status: SystemStatusLevel;
  message: string;
}

export interface BackupSummary {
  backupCount: number;
  totalSizeBytes: number;
  lastBackup: {
    filename: string;
    path: string;
    sizeBytes: number;
    modifiedAt: string;
  } | null;
}

export interface SystemStatus {
  status: SystemStatusLevel;
  app: {
    version: string;
    gitSha: string;
    nodeVersion: string;
    startedAt: string;
    uptimeSeconds: number;
  };
  paths: {
    dataDir: string;
    mediaDir: string;
    backupDir: string;
    databasePath: string;
  };
  database: {
    schemaVersion: number;
    currentSchemaVersion: number;
    migrationState: 'current' | 'behind' | 'ahead';
    integrity: 'ok' | 'error';
    foreignKeys: 'ok' | 'error';
    sizeBytes: number;
    walSizeBytes: number;
    shmSizeBytes: number;
    totalSizeBytes: number;
  };
  counts: {
    notes: number;
    tags: number;
    media: number;
    linkMetadataJobs: number;
  };
  backups: BackupSummary;
  checks: SystemCheck[];
}

export interface HealthStatus {
  status: SystemStatusLevel;
  version: string;
  gitSha: string;
  schemaVersion: number;
  currentSchemaVersion: number;
  uptimeSeconds: number;
  checks: SystemCheck[];
}
