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

  const textOutput = useMemo(
    () => notes.map((n) => n.body).join('\n'),
    [notes],
  );

  const urlOutput = useMemo(() => {
    const allUrls = notes.flatMap((n) => extractUrls(n.body));
    const unique = [...new Set(allUrls)];
    if (sorted) unique.sort();
    return unique.join('\n');
  }, [notes, sorted]);

  const output = mode === 'text' ? textOutput : urlOutput;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => { setCopied(false); }, 1500);
  }, [output]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'text' ? 'notes.txt' : 'urls.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [output, mode]);

  const handleDelete = useCallback(() => {
    onDelete();
    onClose();
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
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button className="export-action-btn export-download-btn" onClick={handleDownload}>
            Download .txt
          </button>
          <button className="export-action-btn export-delete-btn" onClick={handleDelete}>
            Delete selected
          </button>
        </div>
      </div>
    </div>
  );
}
