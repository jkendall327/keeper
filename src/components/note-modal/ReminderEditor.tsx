import { useRef, useState } from 'react';
import type { NoteId, Reminder } from '../../db/types.ts';
import { useReminderMutations } from '../../hooks/useKeeperQuery.ts';
import {
  currentTimeZone,
  defaultReminderDateTimeInput,
  formatReminderDateTime,
  formatZonedLocalDateTimeInput,
  parseZonedLocalDateTimeInput,
} from '../../utils/reminders.ts';
import { Icon } from '../Icon.tsx';
import styles from './ReminderEditor.module.css';

interface ReminderEditorProps {
  noteId: NoteId;
  reminder: Reminder | null;
}

export function ReminderEditor({ noteId, reminder }: ReminderEditorProps) {
  const { setReminder, deleteReminder } = useReminderMutations();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [localDateTime, setLocalDateTime] = useState(() => (
    reminder === null
      ? defaultReminderDateTimeInput()
      : reminder.scheduled_local
  ));
  const [editingTimeZone, setEditingTimeZone] = useState(() => (
    reminder?.scheduled_time_zone ?? currentTimeZone()
  ));
  const [minimumInstant] = useState(Date.now);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const minimumDateTime = formatZonedLocalDateTimeInput(minimumInstant, editingTimeZone);

  const handleSave = async () => {
    const dueAtUtcMs = parseZonedLocalDateTimeInput(
      localDateTime,
      editingTimeZone,
      reminder?.due_at_utc_ms,
    );
    if (dueAtUtcMs === null) {
      setError('Choose a valid local date and time.');
      return;
    }
    if (dueAtUtcMs <= Date.now()) {
      setError('Choose a time in the future.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await setReminder({
        noteId,
        dueAtUtcMs,
        scheduledTimeZone: editingTimeZone,
        scheduledLocal: localDateTime,
      });
      setEditing(false);
      requestAnimationFrame(() => { editButtonRef.current?.focus(); });
    } catch {
      setError('Unable to save this reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError('');
    try {
      await deleteReminder(noteId);
      setLocalDateTime(defaultReminderDateTimeInput());
      setEditingTimeZone(currentTimeZone());
      setEditing(false);
    } catch {
      setError('Unable to remove this reminder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.section} aria-labelledby={`reminder-title-${noteId}`}>
      <h4 className={styles.title} id={`reminder-title-${noteId}`}>Reminder</h4>
      {reminder !== null && !editing ? (
        <div className={styles.summary}>
          <Icon name="notifications" size={17} />
          <div className={styles.summaryText}>
            <time dateTime={new Date(reminder.due_at_utc_ms).toISOString()}>
              {formatReminderDateTime(reminder.due_at_utc_ms)}
            </time>
            {reminder.surfaced_at_utc_ms !== null && (
              <span className={styles.dueLabel}>Due</span>
            )}
          </div>
          <button
            ref={editButtonRef}
            type="button"
            className={styles.iconButton}
            aria-label="Edit reminder"
            title="Edit reminder"
            onClick={() => {
              setLocalDateTime(reminder.scheduled_local);
              setEditingTimeZone(reminder.scheduled_time_zone);
              setEditing(true);
            }}
          >
            <Icon name="edit" size={17} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Remove reminder"
            title="Remove reminder"
            disabled={saving}
            onClick={() => { void handleRemove(); }}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      ) : editing ? (
        <div className={styles.form}>
          <label className={styles.label} htmlFor={`reminder-at-${noteId}`}>Date and time</label>
          <input
            id={`reminder-at-${noteId}`}
            className={styles.input}
            type="datetime-local"
            min={minimumDateTime}
            value={localDateTime}
            onChange={(event) => {
              setLocalDateTime(event.target.value);
              setError('');
            }}
          />
          <p className={styles.hint}>
            Time zone: {editingTimeZone}. This stays tied to the same instant if you travel.
          </p>
          {error !== '' && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={saving || localDateTime === ''}
              onClick={() => { void handleSave(); }}
            >
              {saving ? 'Saving…' : reminder === null ? 'Set reminder' : 'Update'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={saving}
              onClick={() => { setEditing(false); setError(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addButton}
          onClick={() => {
            setEditingTimeZone(currentTimeZone());
            setEditing(true);
          }}
        >
          <Icon name="add_alarm" size={18} /> Add reminder
        </button>
      )}
      {!editing && error !== '' && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
