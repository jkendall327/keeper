import { Icon } from '../Icon.tsx';
import { useSystemStatus } from '../../hooks/useKeeperQuery.ts';
import type { SystemStatusLevel } from '../../system-status.ts';
import styles from '../SettingsModal.module.css';

export function SystemStatusSettings() {
  const status = useSystemStatus();

  if (status.isPending) {
    return (
      <div className={styles.section}>
        <p className={styles.status}>Loading system status...</p>
      </div>
    );
  }

  if (status.isError) {
    return (
      <div className={styles.section}>
        <p className={styles.error}>Unable to load system status.</p>
      </div>
    );
  }

  const data = status.data;

  return (
    <div className={styles.section}>
      <div className={styles.settingBlock}>
        <div className={styles.statusHeader}>
          <div>
            <h3 className={styles.subheading}>System Status</h3>
            <p className={styles.hint}>Runtime, storage, backup, and database health.</p>
          </div>
          <StatusPill status={data.status} />
        </div>
        <div className={styles.keyActions}>
          <button
            className={styles.saveBtn}
            onClick={() => { void status.refetch(); }}
            disabled={status.isFetching}
          >
            <Icon name="refresh" size={16} /> {status.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className={styles.settingBlock}>
        <h3 className={styles.subheading}>Application</h3>
        <dl className={styles.statusGrid}>
          <StatusItem label="Version" value={`v${data.app.version} (${data.app.gitSha})`} />
          <StatusItem label="Node" value={data.app.nodeVersion} />
          <StatusItem label="Started" value={formatDate(data.app.startedAt)} />
          <StatusItem label="Uptime" value={formatDuration(data.app.uptimeSeconds)} />
        </dl>
      </div>

      <div className={styles.settingBlock}>
        <h3 className={styles.subheading}>Storage</h3>
        <dl className={styles.statusGrid}>
          <StatusItem label="Data path" value={data.paths.dataDir} mono />
          <StatusItem label="Database" value={data.paths.databasePath} mono />
          <StatusItem label="Media" value={data.paths.mediaDir} mono />
          <StatusItem label="Backups" value={data.paths.backupDir} mono />
        </dl>
      </div>

      <div className={styles.settingBlock}>
        <h3 className={styles.subheading}>Database</h3>
        <dl className={styles.statusGrid}>
          <StatusItem label="Schema" value={`${String(data.database.schemaVersion)} / ${String(data.database.currentSchemaVersion)} (${data.database.migrationState})`} />
          <StatusItem label="Size" value={formatBytes(data.database.totalSizeBytes)} />
          <StatusItem label="Notes" value={String(data.counts.notes)} />
          <StatusItem label="Tags" value={String(data.counts.tags)} />
          <StatusItem label="Media records" value={String(data.counts.media)} />
          <StatusItem label="Link jobs" value={String(data.counts.linkMetadataJobs)} />
        </dl>
      </div>

      <div className={styles.settingBlock}>
        <h3 className={styles.subheading}>Backups</h3>
        <dl className={styles.statusGrid}>
          <StatusItem label="Stored backups" value={String(data.backups.backupCount)} />
          <StatusItem label="Backup storage" value={formatBytes(data.backups.totalSizeBytes)} />
          <StatusItem
            label="Last backup"
            value={data.backups.lastBackup === null ? 'None yet' : `${formatDate(data.backups.lastBackup.modifiedAt)} (${formatBytes(data.backups.lastBackup.sizeBytes)})`}
          />
          <StatusItem label="Last file" value={data.backups.lastBackup?.path ?? 'None yet'} mono />
        </dl>
      </div>

      <div className={styles.settingBlock}>
        <h3 className={styles.subheading}>Startup Checks</h3>
        <div className={styles.checkList}>
          {data.checks.map((check) => (
            <div className={styles.checkRow} key={check.id}>
              <StatusPill status={check.status} />
              <div>
                <div className={styles.label}>{check.label}</div>
                <div className={styles.hint}>{check.message}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.statusItem}>
      <dt>{label}</dt>
      <dd className={mono ? styles.monoValue : undefined}>{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: SystemStatusLevel }) {
  const className =
    status === 'ok'
      ? styles.statusPillOk
      : status === 'warning'
        ? styles.statusPillWarning
        : styles.statusPillError;

  return (
    <span className={`${styles.statusPill} ${className}`}>
      {status}
    </span>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let current = value / 1024;
  for (const unit of units) {
    if (current < 1024) return `${current.toFixed(current >= 10 ? 1 : 2)} ${unit}`;
    current /= 1024;
  }
  return `${current.toFixed(1)} PB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ${String(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)}h ${String(minutes % 60)}m`;
}
