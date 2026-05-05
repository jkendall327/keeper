import { useState } from 'react';
import type { NoteWithTags } from '../db/types.ts';
import { extractUrls } from '../db/url-detect.ts';
import styles from './ExportModal.module.css';

type Mode = 'text' | 'urls';

interface ExportModalProps {
  notes: NoteWithTags[];
  onClose: () => void;
  onDelete: () => void;
}

function cx(...classes: (string | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function ExportModal({ notes, onClose, onDelete }: ExportModalProps) {
  const [mode, setMode] = useState<Mode>('text');
  const [sorted, setSorted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [separator, setSeparator] = useState<'\n' | '\n\n'>('\n');
  const [exportCompleted, setExportCompleted] = useState(false);

  const textOutput = notes.map((n) => n.body).join(separator);

  const allUrls = notes.flatMap((n) => extractUrls(n.body));
  const uniqueUrls = [...new Set(allUrls)];
  if (sorted) uniqueUrls.sort();
  const urlOutput = uniqueUrls.join('\n');

  const output = mode === 'text' ? textOutput : urlOutput;

  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setCopyFailed(false);
      setExportCompleted(true);
      setTimeout(() => { setCopied(false); }, 1500);
    } catch {
      setCopyFailed(true);
      setTimeout(() => { setCopyFailed(false); }, 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'text' ? 'notes.txt' : 'urls.txt';
    a.click();
    URL.revokeObjectURL(url);
    setExportCompleted(true);
  };

  const handleBurn = () => {
    onClose();
    onDelete();
  };

  return (
    <div className={`${styles.backdrop} modal-backdrop`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.tabs}>
          <button
            className={cx(styles.tab, mode === 'text' && styles.tabActive)}
            onClick={() => { setMode('text'); }}
          >
            Text
          </button>
          <button
            className={cx(styles.tab, mode === 'urls' && styles.tabActive)}
            onClick={() => { setMode('urls'); }}
          >
            URLs
          </button>
        </div>

        {mode === 'text' && (
          <div className={styles.separatorToggle} role="radiogroup" aria-label="Note separator">
            <label>
              <input
                type="radio"
                name="separator"
                checked={separator === '\n'}
                onChange={() => { setSeparator('\n'); }}
              />
              Compact
            </label>
            <label>
              <input
                type="radio"
                name="separator"
                checked={separator === '\n\n'}
                onChange={() => { setSeparator('\n\n'); }}
              />
              Spaced
            </label>
          </div>
        )}

        {mode === 'urls' && (
          <label className={styles.sortToggle}>
            <input
              type="checkbox"
              checked={sorted}
              onChange={(e) => { setSorted(e.target.checked); }}
            />
            Sort alphabetically
          </label>
        )}

        <textarea
          className={styles.preview}
          readOnly
          aria-label="Export preview"
          value={output}
        />

        <div className={styles.actions}>
          <button className={cx(styles.actionButton, styles.copyButton)} onClick={() => { void handleCopy(); }}>
            {copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy to clipboard'}
          </button>
          <button className={styles.actionButton} onClick={handleDownload}>
            Download .txt
          </button>
          {exportCompleted && (
            <button className={cx(styles.actionButton, styles.burnButton)} onClick={handleBurn}>
              Permanently delete {notes.length === 1 ? 'this note' : `these ${String(notes.length)} notes`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
