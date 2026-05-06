import { useState } from 'react';
import { getDB } from '../../db/db-client.ts';
import type { AppSettings } from '../../db/types.ts';
import styles from '../SettingsModal.module.css';

interface LinkPreviewSettingsProps {
  linkPreviewFetchEnabled: boolean;
  linkPreviewDisplayEnabled: boolean;
  onAppSettingsChange: (settings: AppSettings) => void;
}

export function LinkPreviewSettings({
  linkPreviewFetchEnabled,
  linkPreviewDisplayEnabled,
  onAppSettingsChange,
}: LinkPreviewSettingsProps) {
  const [settingsError, setSettingsError] = useState('');

  const saveBooleanSetting = async (
    setting: 'linkPreviewFetchEnabled' | 'linkPreviewDisplayEnabled',
    enabled: boolean,
  ) => {
    setSettingsError('');
    try {
      const settings = await getDB().updateAppSettings({ [setting]: enabled });
      onAppSettingsChange(settings);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  };

  return (
    <div className={styles.section}>
      <label className={styles.toggleRow} htmlFor="link-preview-fetch">
        <input
          id="link-preview-fetch"
          type="checkbox"
          checked={linkPreviewFetchEnabled}
          onChange={(e) => { void saveBooleanSetting('linkPreviewFetchEnabled', e.target.checked); }}
        />
        <span>
          <span className={styles.label}>Fetch Open Graph images</span>
          <span className={styles.hint}>When a note is only a URL, Keeper checks the page for og:image.</span>
        </span>
      </label>
      <label className={styles.toggleRow} htmlFor="link-preview-display">
        <input
          id="link-preview-display"
          type="checkbox"
          checked={linkPreviewDisplayEnabled}
          onChange={(e) => { void saveBooleanSetting('linkPreviewDisplayEnabled', e.target.checked); }}
        />
        <span>
          <span className={styles.label}>Show link preview images</span>
          <span className={styles.hint}>Cached previews stay stored, but notes render as links when this is off.</span>
        </span>
      </label>
      {settingsError !== '' && <p className={styles.error}>{settingsError}</p>}
    </div>
  );
}
