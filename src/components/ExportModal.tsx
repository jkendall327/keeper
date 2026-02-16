import { useState, useMemo, useCallback } from 'react';
import type { NoteWithTags } from '../db/types.ts';
import { extractUrls } from '../db/url-detect.ts';

type Mode = 'text' | 'urls';

interface ExportModalProps {
  notes: NoteWithTags[];
  onClose: () => void;
  onDelete: () => void;
}

export function ExportModal({ notes, onClose, onDelete }: ExportModalProps) {
  const [mode, setMode] = useState<Mode>('text');
  const [sorted, setSorted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [separator, setSeparator] = useState<'\n' | '\n\n'>('\n');
  const [exportCompleted, setExportCompleted] = useState(false);

  const textOutput = useMemo(
    () => notes.map((n) => n.body).join(separator),
    [notes, separator],
  );

  const urlOutput = useMemo(() => {
    const allUrls = notes.flatMap((n) => extractUrls(n.body));
    const unique = [...new Set(allUrls)];
    if (sorted) unique.sort();
    return unique.join('\n');
  }, [notes, sorted]);

  const output = mode === 'text' ? textOutput : urlOutput;

  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = useCallback(async () => {
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
  }, [output]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'text' ? 'notes.txt' : 'urls.txt';
    a.click();
    URL.revokeObjectURL(url);
    setExportCompleted(true);
  }, [output, mode]);

  const handleBurn = useCallback(() => {
    onClose();
    onDelete();
  }, [onDelete, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="export-modal">
        <div className="export-tabs">
          <button
            className={`export-tab${mode === 'text' ? ' export-tab-active' : ''}`}
            onClick={() => { setMode('text'); }}
          >
            Text
          </button>
          <button
            className={`export-tab${mode === 'urls' ? ' export-tab-active' : ''}`}
            onClick={() => { setMode('urls'); }}
          >
            URLs
          </button>
        </div>

        {mode === 'text' && (
          <div className="export-separator-toggle" role="radiogroup" aria-label="Note separator">
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
          <label className="export-sort-toggle">
            <input
              type="checkbox"
              checked={sorted}
              onChange={(e) => { setSorted(e.target.checked); }}
            />
            Sort alphabetically
          </label>
        )}

        <textarea
          className="export-preview"
          readOnly
          value={output}
        />

        <div className="export-actions">
          <button className="export-action-btn export-copy-btn" onClick={() => { void handleCopy(); }}>
            {copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy to clipboard'}
          </button>
          <button className="export-action-btn export-download-btn" onClick={handleDownload}>
            Download .txt
          </button>
          {exportCompleted && (
            <button className="export-action-btn export-burn-btn" onClick={handleBurn}>
              Permanently delete {notes.length === 1 ? 'this note' : `these ${String(notes.length)} notes`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
