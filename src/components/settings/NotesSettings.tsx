import { useState } from 'react';
import {
  MAX_EXTENSION_TITLE_MAX_LENGTH,
  MAX_POPULAR_TAG_SUGGESTION_LIMIT,
  MIN_EXTENSION_TITLE_MAX_LENGTH,
  MIN_POPULAR_TAG_SUGGESTION_LIMIT,
  normalizePopularTagSuggestionLimit,
} from '../../db/types.ts';
import { useUpdateAppSettings } from '../../hooks/useKeeperQuery.ts';
import { normalizeExtensionTitleMaxLength } from '../../utils/extension-title.ts';
import styles from '../SettingsModal.module.css';

interface NotesSettingsProps {
  autoApplyActiveTag: boolean;
  extensionTitleMaxLength: number;
  extensionBadgeEnabled: boolean;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
  onAutoApplyActiveTagChange: (enabled: boolean) => void;
}

export function NotesSettings({
  autoApplyActiveTag,
  extensionTitleMaxLength: savedExtensionTitleMaxLength,
  extensionBadgeEnabled,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
  onAutoApplyActiveTagChange,
}: NotesSettingsProps) {
  const updateAppSettings = useUpdateAppSettings();
  const [extensionTitleMaxLength, setExtensionTitleMaxLength] = useState(String(savedExtensionTitleMaxLength));
  const [extensionTitleSaved, setExtensionTitleSaved] = useState(false);
  const [extensionTitleError, setExtensionTitleError] = useState('');
  const [popularTagLimitDraft, setPopularTagLimitDraft] = useState(String(popularTagSuggestionLimit));
  const [popularTagLimitSaved, setPopularTagLimitSaved] = useState(false);
  const [popularTagLimitError, setPopularTagLimitError] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const saveBooleanSetting = async (
    setting: 'extensionBadgeEnabled' | 'popularTagSuggestionsEnabled',
    enabled: boolean,
  ) => {
    setSettingsError('');
    try {
      await updateAppSettings({ [setting]: enabled });
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  };

  const saveExtensionTitleMaxLength = async () => {
    setExtensionTitleError('');
    try {
      const normalized = normalizeExtensionTitleMaxLength(Number(extensionTitleMaxLength));
      const settings = await updateAppSettings({ extensionTitleMaxLength: normalized });
      setExtensionTitleMaxLength(String(settings.extensionTitleMaxLength));
      setExtensionTitleSaved(true);
      setTimeout(() => { setExtensionTitleSaved(false); }, 1500);
    } catch (error) {
      setExtensionTitleError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  };

  const savePopularTagSuggestionLimit = async () => {
    setPopularTagLimitError('');
    try {
      const normalized = normalizePopularTagSuggestionLimit(Number(popularTagLimitDraft));
      const settings = await updateAppSettings({ popularTagSuggestionLimit: normalized });
      setPopularTagLimitDraft(String(settings.popularTagSuggestionLimit));
      setPopularTagLimitSaved(true);
      setTimeout(() => { setPopularTagLimitSaved(false); }, 1500);
    } catch (error) {
      setPopularTagLimitError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  };

  return (
    <div className={styles.section}>
      <label className={styles.toggleRow} htmlFor="auto-apply-active-tag">
        <input
          id="auto-apply-active-tag"
          type="checkbox"
          checked={autoApplyActiveTag}
          onChange={(e) => { onAutoApplyActiveTagChange(e.target.checked); }}
        />
        <span>
          <span className={styles.label}>Apply current tag to new notes</span>
          <span className={styles.hint}>New notes created from a tag view inherit that tag.</span>
        </span>
      </label>
      <label className={styles.toggleRow} htmlFor="extension-badge-enabled">
        <input
          id="extension-badge-enabled"
          type="checkbox"
          checked={extensionBadgeEnabled}
          onChange={(e) => { void saveBooleanSetting('extensionBadgeEnabled', e.target.checked); }}
        />
        <span>
          <span className={styles.label}>Show extension note count in tab title</span>
          <span className={styles.hint}>Notes saved from the browser extension add to the count until this tab is focused.</span>
        </span>
      </label>
      <label className={styles.toggleRow} htmlFor="popular-tag-suggestions-enabled">
        <input
          id="popular-tag-suggestions-enabled"
          type="checkbox"
          checked={popularTagSuggestionsEnabled}
          onChange={(e) => { void saveBooleanSetting('popularTagSuggestionsEnabled', e.target.checked); }}
        />
        <span>
          <span className={styles.label}>Suggest popular tags in empty tag fields</span>
          <span className={styles.hint}>When a note tag field is focused, show the most-used tags before you type.</span>
        </span>
      </label>
      <label className={styles.label} htmlFor="popular-tag-suggestion-limit">
        Popular tag suggestions
      </label>
      <p className={styles.hint}>
        Number of popular tags to show in an empty note tag field.
      </p>
      <div className={styles.keyRow}>
        <input
          id="popular-tag-suggestion-limit"
          type="number"
          min={MIN_POPULAR_TAG_SUGGESTION_LIMIT}
          max={MAX_POPULAR_TAG_SUGGESTION_LIMIT}
          className={styles.keyInput}
          value={popularTagLimitDraft}
          onChange={(e) => {
            setPopularTagLimitDraft(e.target.value);
            setPopularTagLimitSaved(false);
            setPopularTagLimitError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void savePopularTagSuggestionLimit();
            }
          }}
        />
      </div>
      {popularTagLimitError !== '' && <p className={styles.error}>{popularTagLimitError}</p>}
      <div className={styles.keyActions}>
        <button className={styles.saveBtn} onClick={() => { void savePopularTagSuggestionLimit(); }}>
          {popularTagLimitSaved ? 'Saved!' : 'Save'}
        </button>
      </div>
      <label className={styles.label} htmlFor="extension-title-max-length">
        Extension title length
      </label>
      <p className={styles.hint}>
        Page titles longer than this are shortened when notes are created by the extension.
      </p>
      <div className={styles.keyRow}>
        <input
          id="extension-title-max-length"
          type="number"
          min={MIN_EXTENSION_TITLE_MAX_LENGTH}
          max={MAX_EXTENSION_TITLE_MAX_LENGTH}
          className={styles.keyInput}
          value={extensionTitleMaxLength}
          onChange={(e) => {
            setExtensionTitleMaxLength(e.target.value);
            setExtensionTitleSaved(false);
            setExtensionTitleError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void saveExtensionTitleMaxLength();
            }
          }}
        />
      </div>
      {extensionTitleError !== '' && <p className={styles.error}>{extensionTitleError}</p>}
      <div className={styles.keyActions}>
        <button className={styles.saveBtn} onClick={() => { void saveExtensionTitleMaxLength(); }}>
          {extensionTitleSaved ? 'Saved!' : 'Save'}
        </button>
      </div>
      {settingsError !== '' && <p className={styles.error}>{settingsError}</p>}
    </div>
  );
}
