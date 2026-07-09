import { useState } from 'react';
import { clsx } from 'clsx';
import { tagDisplayIcon, type Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { IconPicker } from './IconPicker.tsx';
import styles from './Sidebar.module.css';

export type FilterType =
  | { type: 'all' }
  | { type: 'untagged' }
  | { type: 'archive' }
  | { type: 'trash' }
  | { type: 'links' }
  | { type: 'duplicates' }
  | { type: 'chat' }
  | { type: 'tag'; tagId: number | null; tagName: string };

interface SidebarProps {
  tags: Tag[];
  activeFilter: FilterType;
  advancedModeEnabled: boolean;
  onFilterChange: (filter: FilterType) => void;
  onRenameTag: (oldName: string, newName: string) => void;
  onDeleteTag: (tagId: number) => void;
  onUpdateTagIcon: (tagId: number, icon: string | null) => void;
  onOpenSettings: () => void;
  isOpen?: boolean;
}

export function Sidebar({ tags, activeFilter, advancedModeEnabled, onFilterChange, onRenameTag, onDeleteTag, onUpdateTagIcon, onOpenSettings, isOpen }: SidebarProps) {
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [iconPickerTagId, setIconPickerTagId] = useState<number | null>(null);
  const [iconPickerAnchor, setIconPickerAnchor] = useState<HTMLButtonElement | null>(null);
  const appVersionLabel = `v${__APP_VERSION__} (${__APP_GIT_SHA__})`;

  const isActive = (filter: FilterType) =>
    activeFilter.type === filter.type &&
    (filter.type !== 'tag' || (activeFilter.type === 'tag' && activeFilter.tagId === filter.tagId));

  const handleStartEdit = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditValue(tag.name);
  };

  const handleSaveEdit = (tag: Tag) => {
    const trimmed = editValue.trim();
    if (trimmed !== '' && trimmed !== tag.name) {
      onRenameTag(tag.name, trimmed);
    }
    setEditingTagId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditValue('');
  };

  return (
    <aside
      className={clsx(styles.sidebar, isOpen === true && styles.open)}
      aria-label="Sidebar"
    >
      <nav className={styles.nav}>
        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'all' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'all' }); }}
        >
          <Icon name="notes" size={18} /> Inbox
        </button>

        {tags.map((tag) => (
          <div key={tag.id} className={styles.tagItem}>
            {editingTagId === tag.id ? (
              <input
                type="text"
                className={styles.tagInput}
                value={editValue}
                onChange={(e) => { setEditValue(e.target.value); }}
                onBlur={() => { handleSaveEdit(tag); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit(tag);
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                autoFocus
              />
            ) : (
              <>
                <div className={styles.tagIconWrapper}>
                  <button
                    className={styles.tagIconButton}
                    onClick={(e) => {
                      if (iconPickerTagId === tag.id) {
                        setIconPickerTagId(null);
                        setIconPickerAnchor(null);
                      } else {
                        setIconPickerTagId(tag.id);
                        setIconPickerAnchor(e.currentTarget);
                      }
                    }}
                    title="Change tag icon"
                    aria-label={`Change icon for ${tag.name}`}
                  >
                    <Icon name={tagDisplayIcon(tag)} size={18} />
                  </button>
                  {iconPickerTagId === tag.id && (
                    <IconPicker
                      onSelect={(iconName) => {
                        onUpdateTagIcon(tag.id, iconName);
                        setIconPickerTagId(null);
                        setIconPickerAnchor(null);
                      }}
                      onClose={() => {
                        setIconPickerTagId(null);
                        setIconPickerAnchor(null);
                      }}
                      anchorEl={iconPickerAnchor}
                    />
                  )}
                </div>
                <button
                  className={clsx(styles.tab, styles.tagName, isActive({ type: 'tag', tagId: tag.id, tagName: tag.name }) && styles.tabActive)}
                  onClick={() => { onFilterChange({ type: 'tag', tagId: tag.id, tagName: tag.name }); }}
                  onDoubleClick={() => { handleStartEdit(tag); }}
                >
                  {tag.name}
                </button>
                <button
                  className={styles.tagDelete}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTag(tag.id);
                  }}
                  title="Delete tag"
                  aria-label={`Delete tag ${tag.name}`}
                >
                  <Icon name="delete" size={16} />
                </button>
              </>
            )}
          </div>
        ))}

        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'untagged' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'untagged' }); }}
        >
          <Icon name="label_off" size={18} /> Untagged
        </button>

        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'links' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'links' }); }}
        >
          <Icon name="link" size={18} /> Links
        </button>

        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'duplicates' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'duplicates' }); }}
        >
          <Icon name="content_copy" size={18} /> Duplicates
        </button>

        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'archive' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'archive' }); }}
        >
          <Icon name="archive" size={18} /> Archive
        </button>

        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'trash' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'trash' }); }}
        >
          <Icon name="delete" size={18} /> Trash
        </button>

        <button
          className={clsx(styles.tab, styles.viewTab, isActive({ type: 'chat' }) && styles.tabActive)}
          onClick={() => { onFilterChange({ type: 'chat' }); }}
        >
          <Icon name="chat" size={18} /> Chat
        </button>
      </nav>
      <div className={styles.footer}>
        <button className={styles.settingsButton} onClick={onOpenSettings} aria-label="Open settings">
          <Icon name="settings" size={20} />
        </button>
        {advancedModeEnabled && (
          <div className={styles.appMetadata} title={appVersionLabel}>
            {appVersionLabel}
          </div>
        )}
      </div>
    </aside>
  );
}
