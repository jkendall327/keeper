import { clsx } from 'clsx';
import { tagDisplayIcon } from '../db/types.ts';
import type { NoteLink } from '../llm/tools.ts';
import { Icon } from './Icon.tsx';
import styles from './ChatNoteLinks.module.css';

interface ChatNoteLinksProps {
  links: NoteLink[];
  onOpen: (id: string) => void;
}

function noteLabel(link: NoteLink): string {
  if (link.note === null) return `Note ${link.id}`;
  return link.note.title.trim() !== ''
    ? link.note.title
    : link.note.bodyPreview !== '' ? link.note.bodyPreview : 'Untitled note';
}

export function ChatNoteLinks({ links, onOpen }: ChatNoteLinksProps) {
  if (links.length === 0) return null;

  return (
    <div className={styles.stack} aria-label="Displayed notes">
      {links.map((link) => {
        const isFound = link.status === 'found' && link.note !== null;
        const title = noteLabel(link);
        return (
          <button
            key={link.id}
            type="button"
            className={clsx(styles.badge, !isFound && styles.unavailable, link.note?.trashed === true && styles.trashed)}
            disabled={!isFound}
            onClick={() => { onOpen(link.id); }}
            aria-label={isFound ? `Open note ${title}` : `Note ${link.id} unavailable`}
          >
            <span className={styles.iconSlot}>
              <Icon name={isFound ? 'sticky_note_2' : 'link_off'} size={16} />
            </span>
            <span className={styles.content}>
              <span className={styles.titleRow}>
                <span className={styles.title}>{title}</span>
                {link.note?.pinned === true && <Icon name="push_pin" size={13} />}
                {link.note?.archived === true && <span className={styles.state}>Archived</span>}
                {link.note?.trashed === true && <span className={styles.state}>Trash</span>}
                {!isFound && <span className={styles.state}>Unavailable</span>}
              </span>
              {link.note !== null && link.note.bodyPreview !== '' && (
                <span className={styles.preview}>{link.note.bodyPreview}</span>
              )}
              {link.note !== null && link.note.tags.length > 0 && (
                <span className={styles.tags}>
                  {link.note.tags.slice(0, 3).map((tag) => (
                    <span key={tag.id} className={styles.tag}>
                      <Icon name={tagDisplayIcon(tag)} size={12} />
                      {tag.name}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
