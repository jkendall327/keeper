import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Icon } from './Icon.tsx';
import { getApiKey, setApiKey, clearApiKey, isLLMConfigured } from '../llm/client.ts';
import { getDB } from '../db/db-client.ts';
import {
  MAX_EXTENSION_TITLE_MAX_LENGTH,
  MAX_POPULAR_TAG_SUGGESTION_LIMIT,
  MIN_EXTENSION_TITLE_MAX_LENGTH,
  MIN_POPULAR_TAG_SUGGESTION_LIMIT,
  normalizePopularTagSuggestionLimit,
  type AppSettings,
  type AutoTagRule,
  type Tag,
} from '../db/types.ts';
import { normalizeExtensionTitleMaxLength } from '../utils/extension-title.ts';
import styles from './SettingsModal.module.css';

// TODO: clsx?
function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

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

export function SettingsModal({
  allTags,
  onClose,
  autoApplyActiveTag,
  onAutoApplyActiveTagChange,
  extensionTitleMaxLength: savedExtensionTitleMaxLength,
  extensionBadgeEnabled,
  linkPreviewFetchEnabled,
  linkPreviewDisplayEnabled,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
  onAppSettingsChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'notes' | 'autotag' | 'link-previews'>('api');
  const [key, setKey] = useState(() => getApiKey() ?? '');
  const [configured, setConfigured] = useState(isLLMConfigured);
  const [saved, setSaved] = useState(false);
  const [rules, setRules] = useState<AutoTagRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [pattern, setPattern] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const tagDraftRef = useRef(tagDraft);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ruleError, setRuleError] = useState('');
  const [extensionTitleMaxLength, setExtensionTitleMaxLength] = useState(String(savedExtensionTitleMaxLength));
  const [extensionTitleSaved, setExtensionTitleSaved] = useState(false);
  const [extensionTitleError, setExtensionTitleError] = useState('');
  const [popularTagLimitDraft, setPopularTagLimitDraft] = useState(String(popularTagSuggestionLimit));
  const [popularTagLimitSaved, setPopularTagLimitSaved] = useState(false);
  const [popularTagLimitError, setPopularTagLimitError] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const normalizedPattern = pattern.trim();
  const patternValid = useMemo(() => {
    if (normalizedPattern === '') return false;
    try {
      new RegExp(normalizedPattern, 'i');
      return true;
    } catch {
      return false;
    }
  }, [normalizedPattern]);
  const canSaveRule = patternValid && tagNames.length > 0;
  const selectedTagNames = useMemo(() => new Set(tagNames), [tagNames]);
  const tagSuggestions =
    tagDraft.trim() === ''
      ? []
      : allTags
        .filter(
          (tag) =>
            tag.name.toLowerCase().includes(tagDraft.trim().toLowerCase()) &&
            !selectedTagNames.has(tag.name),
        )
        .slice(0, 8);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      setRules(await getDB().getAutoTagRules());
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDB()
      .getAutoTagRules()
      .then((nextRules) => {
        if (!cancelled) {
          setRules(nextRules);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRulesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(() => {
    if (key.trim() === '') return;
    setApiKey(key.trim());
    setConfigured(true);
    setSaved(true);
    setTimeout(() => { setSaved(false); }, 1500);
  }, [key]);

  const handleClear = useCallback(() => {
    clearApiKey();
    setKey('');
    setConfigured(false);
    setSaved(false);
  }, []);

  const addTagName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setTagNames((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setTagDraft('');
    tagDraftRef.current = '';
    setShowTagSuggestions(false);
  }, []);

  const addDraftTag = useCallback(() => {
    addTagName(tagDraft);
  }, [addTagName, tagDraft]);

  const resetRuleForm = useCallback(() => {
    setPattern('');
    setTagDraft('');
    setTagNames([]);
    setEditingId(null);
    setRuleError('');
  }, []);

  const saveRule = useCallback(async () => {
    if (!canSaveRule) return;
    setRuleError('');
    try {
      if (editingId === null) {
        await getDB().createAutoTagRule({ pattern: normalizedPattern, tagNames });
      } else {
        await getDB().updateAutoTagRule({ id: editingId, pattern: normalizedPattern, tagNames });
      }
      resetRuleForm();
      await loadRules();
    } catch (error) {
      setRuleError(error instanceof Error ? error.message : 'Unable to save rule');
    }
  }, [canSaveRule, editingId, loadRules, normalizedPattern, resetRuleForm, tagNames]);

  const editRule = useCallback((rule: AutoTagRule) => {
    setEditingId(rule.id);
    setPattern(rule.pattern);
    setTagNames(rule.tagNames);
    setTagDraft('');
    setRuleError('');
    setActiveTab('autotag');
  }, []);

  const deleteRule = useCallback(async (rule: AutoTagRule) => {
    if (!window.confirm(`Delete autotag rule /${rule.pattern}/?`)) return;
    await getDB().deleteAutoTagRule(rule.id);
    if (editingId === rule.id) resetRuleForm();
    await loadRules();
  }, [editingId, loadRules, resetRuleForm]);

  const saveExtensionTitleMaxLength = useCallback(async () => {
    setExtensionTitleError('');
    try {
      const normalized = normalizeExtensionTitleMaxLength(Number(extensionTitleMaxLength));
      const settings = await getDB().updateAppSettings({ extensionTitleMaxLength: normalized });
      setExtensionTitleMaxLength(String(settings.extensionTitleMaxLength));
      onAppSettingsChange(settings);
      setExtensionTitleSaved(true);
      setTimeout(() => { setExtensionTitleSaved(false); }, 1500);
    } catch (error) {
      setExtensionTitleError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  }, [extensionTitleMaxLength, onAppSettingsChange]);

  const saveBooleanSetting = useCallback(async (
    setting: 'extensionBadgeEnabled' | 'linkPreviewFetchEnabled' | 'linkPreviewDisplayEnabled' | 'popularTagSuggestionsEnabled',
    enabled: boolean,
  ) => {
    setSettingsError('');
    try {
      const settings = await getDB().updateAppSettings({ [setting]: enabled });
      onAppSettingsChange(settings);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  }, [onAppSettingsChange]);

  const savePopularTagSuggestionLimit = useCallback(async () => {
    setPopularTagLimitError('');
    try {
      const normalized = normalizePopularTagSuggestionLimit(Number(popularTagLimitDraft));
      const settings = await getDB().updateAppSettings({ popularTagSuggestionLimit: normalized });
      setPopularTagLimitDraft(String(settings.popularTagSuggestionLimit));
      onAppSettingsChange(settings);
      setPopularTagLimitSaved(true);
      setTimeout(() => { setPopularTagLimitSaved(false); }, 1500);
    } catch (error) {
      setPopularTagLimitError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  }, [onAppSettingsChange, popularTagLimitDraft]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Settings sections">
          <button className={cx(styles.tab, activeTab === 'api' && styles.tabActive)} onClick={() => { setActiveTab('api'); }} role="tab" aria-selected={activeTab === 'api'}>
            API Key
          </button>
          <button className={cx(styles.tab, activeTab === 'autotag' && styles.tabActive)} onClick={() => { setActiveTab('autotag'); }} role="tab" aria-selected={activeTab === 'autotag'}>
            Autotag Rules
          </button>
          <button className={cx(styles.tab, activeTab === 'notes' && styles.tabActive)} onClick={() => { setActiveTab('notes'); }} role="tab" aria-selected={activeTab === 'notes'}>
            Notes
          </button>
          <button className={cx(styles.tab, activeTab === 'link-previews' && styles.tabActive)} onClick={() => { setActiveTab('link-previews'); }} role="tab" aria-selected={activeTab === 'link-previews'}>
            Link Previews
          </button>
        </div>

        {activeTab === 'api' && (
          <div className={styles.section}>
            <label className={styles.label} htmlFor="openrouter-key">
              OpenRouter API Key
            </label>
            <p className={styles.hint}>
              Required for AI chat. Get a key at openrouter.ai
            </p>
            <div className={styles.keyRow}>
              <input
                id="openrouter-key"
                type="password"
                className={styles.keyInput}
                placeholder="sk-or-..."
                value={key}
                onChange={(e) => { setKey(e.target.value); }}
              />
            </div>
            <div className={styles.keyActions}>
              <button className={styles.saveBtn} onClick={handleSave} disabled={key.trim() === ''}>
                {saved ? 'Saved!' : 'Save'}
              </button>
              {configured && (
                <button className={styles.clearBtn} onClick={handleClear}>
                  Clear key
                </button>
              )}
            </div>
            <p className={styles.status}>
              {configured ? (
                <span className={styles.statusOk}>
                  <Icon name="check_circle" size={16} /> Configured
                </span>
              ) : (
                <span className={styles.statusNone}>
                  <Icon name="error" size={16} /> Not configured
                </span>
              )}
            </p>
          </div>
        )}

        {activeTab === 'notes' && (
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
        )}

        {activeTab === 'link-previews' && (
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
        )}

        {activeTab === 'autotag' && (
          <div className={styles.section}>
            <label className={styles.label} htmlFor="autotag-pattern">
              URL regex
            </label>
            <input
              id="autotag-pattern"
              className={styles.keyInput}
              placeholder="example\\.com"
              value={pattern}
              onChange={(e) => { setPattern(e.target.value); }}
            />
            <label className={styles.label} htmlFor="autotag-tag-input">
              Tags
            </label>
            <div className={styles.autotagTagInputWrapper}>
              <div className={styles.autotagChipInput}>
                {tagNames.map((name) => (
                  <span className={styles.chip} key={name}>
                    {name}
                    <button
                      onClick={() => { setTagNames((current) => current.filter((tag) => tag !== name)); }}
                      aria-label={`Remove rule tag ${name}`}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                ))}
                <input
                  id="autotag-tag-input"
                  placeholder="Add tag..."
                  value={tagDraft}
                  onBlur={() => {
                    setTimeout(() => {
                      addTagName(tagDraftRef.current);
                    }, 150);
                  }}
                  onChange={(e) => {
                    setTagDraft(e.target.value);
                    tagDraftRef.current = e.target.value;
                    setShowTagSuggestions(true);
                  }}
                  onFocus={() => { setShowTagSuggestions(true); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addDraftTag();
                    }
                  }}
                />
              </div>
              {showTagSuggestions && tagSuggestions.length > 0 && (
                <ul className="modal-tag-suggestions">
                  {tagSuggestions.map((tag) => (
                    <li
                      key={tag.id}
                      className="modal-tag-suggestion"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => { addTagName(tag.name); }}
                    >
                      {tag.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {ruleError !== '' && <p className={styles.error}>{ruleError}</p>}
            <div className={styles.keyActions}>
              <button
                className={styles.saveBtn}
                onClick={() => { void saveRule(); }}
                disabled={!canSaveRule}
              >
                {editingId === null ? 'Create Rule' : 'Save Rule'}
              </button>
              {editingId !== null && (
                <button className={styles.clearBtn} onClick={resetRuleForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className={styles.ruleList}>
              {rulesLoading && <p className={styles.hint}>Loading rules...</p>}
              {!rulesLoading && rules.length === 0 && (
                <p className={styles.hint}>No autotag rules configured.</p>
              )}
              {rules.map((rule) => (
                <div className={styles.ruleRow} key={rule.id}>
                  <div className={styles.ruleMain}>
                    <code>/{rule.pattern}/i</code>
                    <div className={styles.ruleTags}>
                      {rule.tagNames.map((name) => (
                        <span className={styles.chip} key={name}>{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.ruleActions}>
                    <button onClick={() => { editRule(rule); }} aria-label={`Edit autotag rule ${rule.pattern}`}>
                      <Icon name="edit" size={18} />
                    </button>
                    <button onClick={() => { void deleteRule(rule); }} aria-label={`Delete autotag rule ${rule.pattern}`}>
                      <Icon name="delete" size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
