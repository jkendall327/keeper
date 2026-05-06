import { useState } from 'react';
import { clsx } from 'clsx';
import { Icon } from './Icon.tsx';
import { ApiKeySettings } from './settings/ApiKeySettings.tsx';
import { AutotagSettings } from './settings/AutotagSettings.tsx';
import { BackupImportSettings } from './settings/BackupImportSettings.tsx';
import { LinkPreviewSettings } from './settings/LinkPreviewSettings.tsx';
import { NotesSettings } from './settings/NotesSettings.tsx';
import type { AppSettings, Tag } from '../db/types.ts';
import styles from './SettingsModal.module.css';

type SettingsTab = 'api' | 'autotag' | 'notes' | 'link-previews' | 'backup-import';

interface SettingsModalProps {
  allTags: Tag[];
  onClose: () => void;
  autoApplyActiveTag: boolean;
  onAutoApplyActiveTagChange: (enabled: boolean) => void;
  extensionTitleMaxLength: number;
  extensionBadgeEnabled: boolean;
  linkPreviewFetchEnabled: boolean;
  linkPreviewDisplayEnabled: boolean;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
  onAppSettingsChange: (settings: AppSettings) => void;
}

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'api', label: 'API Key' },
  { id: 'autotag', label: 'Autotag Rules' },
  { id: 'notes', label: 'Notes' },
  { id: 'link-previews', label: 'Link Previews' },
  { id: 'backup-import', label: 'Backup & Import' },
];

export function SettingsModal({
  allTags,
  onClose,
  autoApplyActiveTag,
  onAutoApplyActiveTagChange,
  extensionTitleMaxLength,
  extensionBadgeEnabled,
  linkPreviewFetchEnabled,
  linkPreviewDisplayEnabled,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
  onAppSettingsChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');

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
            extensionTitleMaxLength={extensionTitleMaxLength}
            extensionBadgeEnabled={extensionBadgeEnabled}
            popularTagSuggestionsEnabled={popularTagSuggestionsEnabled}
            popularTagSuggestionLimit={popularTagSuggestionLimit}
            onAutoApplyActiveTagChange={onAutoApplyActiveTagChange}
            onAppSettingsChange={onAppSettingsChange}
          />
        )}
        {activeTab === 'link-previews' && (
          <LinkPreviewSettings
            linkPreviewFetchEnabled={linkPreviewFetchEnabled}
            linkPreviewDisplayEnabled={linkPreviewDisplayEnabled}
            onAppSettingsChange={onAppSettingsChange}
          />
        )}
        {activeTab === 'backup-import' && <BackupImportSettings />}
      </div>
    </div>
  );
}
