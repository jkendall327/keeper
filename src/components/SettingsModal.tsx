import { useEffect, useMemo, useState, useCallback } from 'react';
import { Icon } from './Icon.tsx';
import { getApiKey, setApiKey, clearApiKey, isLLMConfigured } from '../llm/client.ts';
import { getDB } from '../db/db-client.ts';
import type { AutoTagRule } from '../db/types.ts';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'autotag'>('api');
  const [key, setKey] = useState(() => getApiKey() ?? '');
  const [configured, setConfigured] = useState(isLLMConfigured);
  const [saved, setSaved] = useState(false);
  const [rules, setRules] = useState<AutoTagRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [pattern, setPattern] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ruleError, setRuleError] = useState('');

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

  const addDraftTag = useCallback(() => {
    const trimmed = tagDraft.trim();
    if (trimmed === '') return;
    setTagNames((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setTagDraft('');
  }, [tagDraft]);

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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          <button
            className={`settings-tab${activeTab === 'api' ? ' settings-tab-active' : ''}`}
            onClick={() => { setActiveTab('api'); }}
            role="tab"
            aria-selected={activeTab === 'api'}
          >
            API Key
          </button>
          <button
            className={`settings-tab${activeTab === 'autotag' ? ' settings-tab-active' : ''}`}
            onClick={() => { setActiveTab('autotag'); }}
            role="tab"
            aria-selected={activeTab === 'autotag'}
          >
            Autotag Rules
          </button>
        </div>

        {activeTab === 'api' && (
          <div className="settings-section">
            <label className="settings-label" htmlFor="openrouter-key">
              OpenRouter API Key
            </label>
            <p className="settings-hint">
              Required for AI chat. Get a key at openrouter.ai
            </p>
            <div className="settings-key-row">
              <input
                id="openrouter-key"
                type="password"
                className="settings-key-input"
                placeholder="sk-or-..."
                value={key}
                onChange={(e) => { setKey(e.target.value); }}
              />
            </div>
            <div className="settings-key-actions">
              <button
                className="settings-save-btn"
                onClick={handleSave}
                disabled={key.trim() === ''}
              >
                {saved ? 'Saved!' : 'Save'}
              </button>
              {configured && (
                <button className="settings-clear-btn" onClick={handleClear}>
                  Clear key
                </button>
              )}
            </div>
            <p className="settings-status">
              {configured ? (
                <span className="settings-status-ok">
                  <Icon name="check_circle" size={16} /> Configured
                </span>
              ) : (
                <span className="settings-status-none">
                  <Icon name="error" size={16} /> Not configured
                </span>
              )}
            </p>
          </div>
        )}

        {activeTab === 'autotag' && (
          <div className="settings-section">
            <label className="settings-label" htmlFor="autotag-pattern">
              URL regex
            </label>
            <input
              id="autotag-pattern"
              className="settings-key-input"
              placeholder="example\\.com"
              value={pattern}
              onChange={(e) => { setPattern(e.target.value); }}
            />
            <label className="settings-label" htmlFor="autotag-tag-input">
              Tags
            </label>
            <div className="autotag-chip-input">
              {tagNames.map((name) => (
                <span className="autotag-chip" key={name}>
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
                onBlur={addDraftTag}
                onChange={(e) => { setTagDraft(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addDraftTag();
                  }
                }}
              />
            </div>
            {ruleError !== '' && <p className="settings-error">{ruleError}</p>}
            <div className="settings-key-actions">
              <button
                className="settings-save-btn"
                onClick={() => { void saveRule(); }}
                disabled={!canSaveRule}
              >
                {editingId === null ? 'Create Rule' : 'Save Rule'}
              </button>
              {editingId !== null && (
                <button className="settings-clear-btn" onClick={resetRuleForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className="autotag-rule-list">
              {rulesLoading && <p className="settings-hint">Loading rules...</p>}
              {!rulesLoading && rules.length === 0 && (
                <p className="settings-hint">No autotag rules configured.</p>
              )}
              {rules.map((rule) => (
                <div className="autotag-rule-row" key={rule.id}>
                  <div className="autotag-rule-main">
                    <code>/{rule.pattern}/i</code>
                    <div className="autotag-rule-tags">
                      {rule.tagNames.map((name) => (
                        <span className="autotag-chip" key={name}>{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="autotag-rule-actions">
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
