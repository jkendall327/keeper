import { useState } from 'react';
import { Icon } from '../Icon.tsx';
import { clearApiKey, getApiKey, isLLMConfigured, setApiKey } from '../../llm/client.ts';
import styles from '../SettingsModal.module.css';

export function ApiKeySettings() {
  const [key, setKey] = useState(() => getApiKey() ?? '');
  const [configured, setConfigured] = useState(isLLMConfigured);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (key.trim() === '') return;
    setApiKey(key.trim());
    setConfigured(true);
    setSaved(true);
    setTimeout(() => { setSaved(false); }, 1500);
  };

  const handleClear = () => {
    clearApiKey();
    setKey('');
    setConfigured(false);
    setSaved(false);
  };

  return (
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
  );
}
