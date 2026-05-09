import { useState } from 'react';
import { useUpdateAppSettings } from '../../hooks/useKeeperQuery.ts';
import styles from '../SettingsModal.module.css';

interface LinkPreviewSettingsProps {
  linkPreviewFetchEnabled: boolean;
  linkPreviewDisplayEnabled: boolean;
}

export function LinkPreviewSettings({
  linkPreviewFetchEnabled,
  linkPreviewDisplayEnabled,
}: LinkPreviewSettingsProps) {
  const updateAppSettings = useUpdateAppSettings();
  const [settingsError, setSettingsError] = useState('');

  const saveBooleanSetting = async (
    setting: 'linkPreviewFetchEnabled' | 'linkPreviewDisplayEnabled',
    enabled: boolean,
  ) => {
    setSettingsError('');
    try {
      await updateAppSettings({ [setting]: enabled });
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
