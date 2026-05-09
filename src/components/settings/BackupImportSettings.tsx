import { useRef, useState } from 'react';
import { useKeeperServices } from '../../services.ts';
import { Icon } from '../Icon.tsx';
import styles from '../SettingsModal.module.css';

type Operation = 'backup' | 'restore' | null;

interface RestoreResult {
  preRestoreBackupPath?: string;
}

export function BackupImportSettings() {
  const { apiFetch } = useKeeperServices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const busy = operation !== null;

  const downloadBackup = async () => {
    setOperation('backup');
    setStatus('');
    setError('');
    try {
      const response = await apiFetch(`/api/backup?includeMedia=${String(includeMedia)}`);
      if (!response.ok) throw new Error(await readResponseError(response, 'Unable to create backup'));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `keeper-backup-${today}.keeper.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Backup download started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create backup');
    } finally {
      setOperation(null);
    }
  };

  const restoreBackup = async () => {
    if (selectedFile === null) return;
    const confirmed = window.confirm(
      'Restore this backup? Keeper will replace the current database and media after creating a pre-restore backup.',
    );
    if (!confirmed) return;

    setOperation('restore');
    setStatus('');
    setError('');
    try {
      const form = new FormData();
      form.append('backup', selectedFile);
      const response = await apiFetch('/api/restore', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await readResponseError(response, 'Unable to restore backup'));

      const result = await response.json() as RestoreResult;
      setStatus(
        result.preRestoreBackupPath != null
          ? `Restore complete. Previous data was backed up to ${result.preRestoreBackupPath}.`
          : 'Restore complete.',
      );
      setSelectedFile(null);
      if (fileInputRef.current !== null) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore backup');
    } finally {
      setOperation(null);
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.settingBlock}>
        <div>
          <h3 className={styles.subheading}>Backup</h3>
          <p className={styles.hint}>
            Download a Keeper archive containing a SQLite snapshot and media files.
          </p>
        </div>
        <label className={styles.toggleRow} htmlFor="backup-include-media">
          <input
            id="backup-include-media"
            type="checkbox"
            checked={includeMedia}
            disabled={busy}
            onChange={(e) => { setIncludeMedia(e.target.checked); }}
          />
          <span>
            <span className={styles.label}>Include media</span>
            <span className={styles.hint}>Add images and other note attachments to the backup archive.</span>
          </span>
        </label>
        <div className={styles.keyActions}>
          <button
            className={styles.saveBtn}
            onClick={() => { void downloadBackup(); }}
            disabled={busy}
          >
            <Icon name="download" size={16} /> {operation === 'backup' ? 'Preparing...' : 'Download Backup'}
          </button>
        </div>
      </div>

      <div className={styles.settingBlock}>
        <div>
          <h3 className={styles.subheading}>Restore</h3>
          <p className={styles.hint}>
            Replace current Keeper data with a backup archive. A pre-restore backup is saved first.
          </p>
        </div>
        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept=".zip,.keeper.zip,application/zip"
          disabled={busy}
          aria-label="Backup archive"
          onChange={(e) => {
            setSelectedFile(e.target.files?.[0] ?? null);
            setStatus('');
            setError('');
          }}
        />
        <div className={styles.keyActions}>
          <button
            className={styles.clearBtn}
            onClick={() => { void restoreBackup(); }}
            disabled={busy || selectedFile === null}
          >
            <Icon name="restore" size={16} /> {operation === 'restore' ? 'Restoring...' : 'Restore Backup'}
          </button>
        </div>
      </div>

      {status !== '' && <p className={styles.statusOk}>{status}</p>}
      {error !== '' && <p className={styles.error}>{error}</p>}
    </div>
  );
}

async function readResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}
