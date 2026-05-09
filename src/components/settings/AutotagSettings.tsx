import { useRef, useState } from 'react';
import { Icon } from '../Icon.tsx';
import { useAutoTagRuleMutations, useAutoTagRules } from '../../hooks/useKeeperQuery.ts';
import type { AutoTagRule, Tag } from '../../db/types.ts';
import styles from '../SettingsModal.module.css';

interface AutotagSettingsProps {
  allTags: Tag[];
}

export function AutotagSettings({ allTags }: AutotagSettingsProps) {
  const { data: rules, isFetching: rulesLoading } = useAutoTagRules();
  const { createRule, deleteRule: deleteRuleMutation, updateRule } = useAutoTagRuleMutations();
  const [pattern, setPattern] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const tagDraftRef = useRef(tagDraft);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ruleError, setRuleError] = useState('');

  const normalizedPattern = pattern.trim();
  let patternValid = false;
  if (normalizedPattern !== '') {
    try {
      new RegExp(normalizedPattern, 'i');
      patternValid = true;
    } catch {
      patternValid = false;
    }
  }
  const canSaveRule = patternValid && tagNames.length > 0;
  const tagSuggestions =
    tagDraft.trim() === ''
      ? []
      : allTags
        .filter(
          (tag) =>
            tag.name.toLowerCase().includes(tagDraft.trim().toLowerCase()) &&
            !tagNames.includes(tag.name),
        )
        .slice(0, 8);

  const addTagName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setTagNames((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setTagDraft('');
    tagDraftRef.current = '';
    setShowTagSuggestions(false);
  };

  const addDraftTag = () => {
    addTagName(tagDraft);
  };

  const resetRuleForm = () => {
    setPattern('');
    setTagDraft('');
    tagDraftRef.current = '';
    setTagNames([]);
    setEditingId(null);
    setRuleError('');
  };

  const saveRule = async () => {
    if (!canSaveRule) return;
    setRuleError('');
    try {
      if (editingId === null) {
        await createRule({ pattern: normalizedPattern, tagNames });
      } else {
        await updateRule({ id: editingId, pattern: normalizedPattern, tagNames });
      }
      resetRuleForm();
    } catch (error) {
      setRuleError(error instanceof Error ? error.message : 'Unable to save rule');
    }
  };

  const editRule = (rule: AutoTagRule) => {
    setEditingId(rule.id);
    setPattern(rule.pattern);
    setTagNames(rule.tagNames);
    setTagDraft('');
    tagDraftRef.current = '';
    setRuleError('');
  };

  const deleteRule = async (rule: AutoTagRule) => {
    if (!window.confirm(`Delete autotag rule /${rule.pattern}/?`)) return;
    await deleteRuleMutation(rule.id);
    if (editingId === rule.id) resetRuleForm();
  };

  return (
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
              const draftAtBlur = tagDraftRef.current;
              setTimeout(() => {
                addTagName(draftAtBlur);
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
          <ul className={styles.tagSuggestions} role="listbox" aria-label="Autotag tag suggestions">
            {tagSuggestions.map((tag) => (
              <li
                key={tag.id}
                className={styles.tagSuggestion}
                role="option"
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
  );
}
