import { useState } from 'react';
import { clsx } from 'clsx';
import { Icon } from './Icon.tsx';
import { ApiKeySettings } from './settings/ApiKeySettings.tsx';
import { AutotagSettings } from './settings/AutotagSettings.tsx';
import { BackupImportSettings } from './settings/BackupImportSettings.tsx';
import { LinkPreviewSettings } from './settings/LinkPreviewSettings.tsx';
import { NotesSettings } from './settings/NotesSettings.tsx';
import { SystemStatusSettings } from './settings/SystemStatusSettings.tsx';
import { useAppSettings, useTags } from '../hooks/useKeeperQuery.ts';
import { useAutoApplyActiveTag } from '../settings.ts';
import styles from './SettingsModal.module.css';

type SettingsTab = 'api' | 'autotag' | 'notes' | 'link-previews' | 'backup-import' | 'system';

interface SettingsModalProps {
  onClose: () => void;
}

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'api', label: 'API Key' },
  { id: 'autotag', label: 'Autotag Rules' },
  { id: 'notes', label: 'Notes' },
  { id: 'link-previews', label: 'Link Previews' },
  { id: 'backup-import', label: 'Backup & Import' },
  { id: 'system', label: 'System' },
];

export function SettingsModal({
  onClose,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');
  const appSettings = useAppSettings();
  const { data: allTags } = useTags();
  const [autoApplyActiveTag, setAutoApplyActiveTag] = useAutoApplyActiveTag();

  return (
    <div
      className={styles.backdrop}
      data-testid="settings-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-labelledby="settings-modal-title">
        <div className={styles.header}>
          <h2 id="settings-modal-title">Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Settings sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={clsx(styles.tab, activeTab === tab.id && styles.tabActive)}
              onClick={() => { setActiveTab(tab.id); }}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'api' && <ApiKeySettings />}
        {activeTab === 'autotag' && <AutotagSettings allTags={allTags} />}
        {activeTab === 'notes' && (
          <NotesSettings
            autoApplyActiveTag={autoApplyActiveTag}
            extensionTitleMaxLength={appSettings.extensionTitleMaxLength}
            extensionBadgeEnabled={appSettings.extensionBadgeEnabled}
            popularTagSuggestionsEnabled={appSettings.popularTagSuggestionsEnabled}
            popularTagSuggestionLimit={appSettings.popularTagSuggestionLimit}
            quickAddAutofocusEnabled={appSettings.quickAddAutofocusEnabled}
            cleanupAutoTagRulesEnabled={appSettings.cleanupAutoTagRulesEnabled}
            cleanupArchiveTaggedEnabled={appSettings.cleanupArchiveTaggedEnabled}
            onAutoApplyActiveTagChange={setAutoApplyActiveTag}
          />
        )}
        {activeTab === 'link-previews' && (
          <LinkPreviewSettings
            linkPreviewFetchEnabled={appSettings.linkPreviewFetchEnabled}
            linkPreviewDisplayEnabled={appSettings.linkPreviewDisplayEnabled}
          />
        )}
        {activeTab === 'backup-import' && <BackupImportSettings />}
        {activeTab === 'system' && (
          <SystemStatusSettings advancedModeEnabled={appSettings.advancedModeEnabled} />
        )}
      </div>
    </div>
  );
}
