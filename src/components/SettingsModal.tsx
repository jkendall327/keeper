import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Icon } from './Icon.tsx';
import { getApiKey, setApiKey, clearApiKey, isLLMConfigured } from '../llm/client.ts';
import { getDB } from '../db/db-client.ts';
import {
  DEFAULT_EXTENSION_TITLE_MAX_LENGTH,
  MAX_EXTENSION_TITLE_MAX_LENGTH,
  MIN_EXTENSION_TITLE_MAX_LENGTH,
  type AppSettings,
  type AutoTagRule,
  type Tag,
} from '../db/types.ts';
import { normalizeExtensionTitleMaxLength } from '../utils/extension-title.ts';
import styles from './SettingsModal.module.css';

function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface SettingsModalProps {
  allTags: Tag[];
  onClose: () => void;
  autoApplyActiveTag: boolean;
  onAutoApplyActiveTagChange: (enabled: boolean) => void;
  extensionBadgeEnabled: boolean;
  linkPreviewFetchEnabled: boolean;
  linkPreviewDisplayEnabled: boolean;
  onAppSettingsChange: (settings: AppSettings) => void;
}

export function SettingsModal({
  allTags,
  onClose,
  autoApplyActiveTag,
  onAutoApplyActiveTagChange,
  extensionBadgeEnabled,
  linkPreviewFetchEnabled,
  linkPreviewDisplayEnabled,
  onAppSettingsChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'notes' | 'autotag' | 'link-previews'>('api');
  const [key, setKey] = useState(() => getApiKey() ?? '');
  const [configured, setConfigured] = useState(isLLMConfigured);
  const [saved, setSaved] = useState(false);
  const [rules, setRules] = useState<AutoTagRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [pattern, setPattern] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const tagDraftRef = useRef(tagDraft);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ruleError, setRuleError] = useState('');
  const [extensionTitleMaxLength, setExtensionTitleMaxLength] = useState(String(DEFAULT_EXTENSION_TITLE_MAX_LENGTH));
  const [extensionTitleSaved, setExtensionTitleSaved] = useState(false);
  const [extensionTitleError, setExtensionTitleError] = useState('');
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
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const settings = await getDB().getAppSettings();
      if (!cancelled) {
        setExtensionTitleMaxLength(String(settings.extensionTitleMaxLength));
        onAppSettingsChange(settings);
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [onAppSettingsChange]);

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
      setExtensionTitleSaved(true);
      setTimeout(() => { setExtensionTitleSaved(false); }, 1500);
    } catch (error) {
      setExtensionTitleError(error instanceof Error ? error.message : 'Unable to save setting');
    }
  }, [extensionTitleMaxLength]);

  const saveBooleanSetting = useCallback(async (
    setting: 'extensionBadgeEnabled' | 'linkPreviewFetchEnabled' | 'linkPreviewDisplayEnabled',
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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles['settings-modal']}>
        <div className={styles['settings-header']}>
          <h2>Settings</h2>
          <button className={styles['settings-close-btn']} onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles['settings-tabs']} role="tablist" aria-label="Settings sections">
          <button
            className={cx(styles['settings-tab'], activeTab === 'api' && styles['settings-tab-active'])}
            onClick={() => { setActiveTab('api'); }}
            role="tab"
            aria-selected={activeTab === 'api'}
          >
            API Key
          </button>
          <button
            className={cx(styles['settings-tab'], activeTab === 'autotag' && styles['settings-tab-active'])}
            onClick={() => { setActiveTab('autotag'); }}
            role="tab"
            aria-selected={activeTab === 'autotag'}
          >
            Autotag Rules
          </button>
          <button
            className={cx(styles['settings-tab'], activeTab === 'notes' && styles['settings-tab-active'])}
            onClick={() => { setActiveTab('notes'); }}
            role="tab"
            aria-selected={activeTab === 'notes'}
          >
            Notes
          </button>
          <button
            className={cx(styles['settings-tab'], activeTab === 'link-previews' && styles['settings-tab-active'])}
            onClick={() => { setActiveTab('link-previews'); }}
            role="tab"
            aria-selected={activeTab === 'link-previews'}
          >
            Link Previews
          </button>
        </div>

        {activeTab === 'api' && (
          <div className={styles['settings-section']}>
            <label className={styles['settings-label']} htmlFor="openrouter-key">
              OpenRouter API Key
            </label>
            <p className={styles['settings-hint']}>
              Required for AI chat. Get a key at openrouter.ai
            </p>
            <div className={styles['settings-key-row']}>
              <input
                id="openrouter-key"
                type="password"
                className={styles['settings-key-input']}
                placeholder="sk-or-..."
                value={key}
                onChange={(e) => { setKey(e.target.value); }}
              />
            </div>
            <div className={styles['settings-key-actions']}>
              <button
                className={styles['settings-save-btn']}
                onClick={handleSave}
                disabled={key.trim() === ''}
              >
                {saved ? 'Saved!' : 'Save'}
              </button>
              {configured && (
                <button className={styles['settings-clear-btn']} onClick={handleClear}>
                  Clear key
                </button>
              )}
            </div>
            <p className={styles['settings-status']}>
              {configured ? (
                <span className={styles['settings-status-ok']}>
                  <Icon name="check_circle" size={16} /> Configured
                </span>
              ) : (
                <span className={styles['settings-status-none']}>
                  <Icon name="error" size={16} /> Not configured
                </span>
              )}
            </p>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className={styles['settings-section']}>
            <label className={styles['settings-toggle-row']} htmlFor="auto-apply-active-tag">
              <input
                id="auto-apply-active-tag"
                type="checkbox"
                checked={autoApplyActiveTag}
                onChange={(e) => { onAutoApplyActiveTagChange(e.target.checked); }}
              />
              <span>
                <span className={styles['settings-label']}>Apply current tag to new notes</span>
                <span className={styles['settings-hint']}>New notes created from a tag view inherit that tag.</span>
              </span>
            </label>
            <label className={styles['settings-toggle-row']} htmlFor="extension-badge-enabled">
              <input
                id="extension-badge-enabled"
                type="checkbox"
                checked={extensionBadgeEnabled}
                onChange={(e) => { void saveBooleanSetting('extensionBadgeEnabled', e.target.checked); }}
              />
              <span>
                <span className={styles['settings-label']}>Show extension note count in tab title</span>
                <span className={styles['settings-hint']}>Notes saved from the browser extension add to the count until this tab is focused.</span>
              </span>
            </label>
            <label className={styles['settings-label']} htmlFor="extension-title-max-length">
              Extension title length
            </label>
            <p className={styles['settings-hint']}>
              Page titles longer than this are shortened when notes are created by the extension.
            </p>
            <div className={styles['settings-key-row']}>
              <input
                id="extension-title-max-length"
                type="number"
                min={MIN_EXTENSION_TITLE_MAX_LENGTH}
                max={MAX_EXTENSION_TITLE_MAX_LENGTH}
                className={styles['settings-key-input']}
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
            {extensionTitleError !== '' && <p className={styles['settings-error']}>{extensionTitleError}</p>}
            <div className={styles['settings-key-actions']}>
              <button
                className={styles['settings-save-btn']}
                onClick={() => { void saveExtensionTitleMaxLength(); }}
              >
                {extensionTitleSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
            {settingsError !== '' && <p className={styles['settings-error']}>{settingsError}</p>}
          </div>
        )}

        {activeTab === 'link-previews' && (
          <div className={styles['settings-section']}>
            <label className={styles['settings-toggle-row']} htmlFor="link-preview-fetch">
              <input
                id="link-preview-fetch"
                type="checkbox"
                checked={linkPreviewFetchEnabled}
                onChange={(e) => { void saveBooleanSetting('linkPreviewFetchEnabled', e.target.checked); }}
              />
              <span>
                <span className={styles['settings-label']}>Fetch Open Graph images</span>
                <span className={styles['settings-hint']}>When a note is only a URL, Keeper checks the page for og:image.</span>
              </span>
            </label>
            <label className={styles['settings-toggle-row']} htmlFor="link-preview-display">
              <input
                id="link-preview-display"
                type="checkbox"
                checked={linkPreviewDisplayEnabled}
                onChange={(e) => { void saveBooleanSetting('linkPreviewDisplayEnabled', e.target.checked); }}
              />
              <span>
                <span className={styles['settings-label']}>Show link preview images</span>
                <span className={styles['settings-hint']}>Cached previews stay stored, but notes render as links when this is off.</span>
              </span>
            </label>
            {settingsError !== '' && <p className={styles['settings-error']}>{settingsError}</p>}
          </div>
        )}

        {activeTab === 'autotag' && (
          <div className={styles['settings-section']}>
            <label className={styles['settings-label']} htmlFor="autotag-pattern">
              URL regex
            </label>
            <input
              id="autotag-pattern"
              className={styles['settings-key-input']}
              placeholder="example\\.com"
              value={pattern}
              onChange={(e) => { setPattern(e.target.value); }}
            />
            <label className={styles['settings-label']} htmlFor="autotag-tag-input">
              Tags
            </label>
            <div className={styles['autotag-tag-input-wrapper']}>
              <div className={styles['autotag-chip-input']}>
                {tagNames.map((name) => (
                  <span className={styles['autotag-chip']} key={name}>
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
            {ruleError !== '' && <p className={styles['settings-error']}>{ruleError}</p>}
            <div className={styles['settings-key-actions']}>
              <button
                className={styles['settings-save-btn']}
                onClick={() => { void saveRule(); }}
                disabled={!canSaveRule}
              >
                {editingId === null ? 'Create Rule' : 'Save Rule'}
              </button>
              {editingId !== null && (
                <button className={styles['settings-clear-btn']} onClick={resetRuleForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className={styles['autotag-rule-list']}>
              {rulesLoading && <p className={styles['settings-hint']}>Loading rules...</p>}
              {!rulesLoading && rules.length === 0 && (
                <p className={styles['settings-hint']}>No autotag rules configured.</p>
              )}
              {rules.map((rule) => (
                <div className={styles['autotag-rule-row']} key={rule.id}>
                  <div className={styles['autotag-rule-main']}>
                    <code>/{rule.pattern}/i</code>
                    <div className={styles['autotag-rule-tags']}>
                      {rule.tagNames.map((name) => (
                        <span className={styles['autotag-chip']} key={name}>{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className={styles['autotag-rule-actions']}>
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
