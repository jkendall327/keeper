import { useState, useCallback } from 'react';
import { Icon } from './Icon.tsx';
import { getApiKey, setApiKey, clearApiKey, isLLMConfigured } from '../llm/client.ts';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [key, setKey] = useState(() => getApiKey() ?? '');
  const [configured, setConfigured] = useState(isLLMConfigured);
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={20} />
          </button>
        </div>

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
      </div>
    </div>
  );
}
