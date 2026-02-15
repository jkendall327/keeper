import { useState } from 'react';
import type { Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { IconPicker } from './IconPicker.tsx';

export type FilterType =
  | { type: 'all' }
  | { type: 'untagged' }
  | { type: 'archive' }
  | { type: 'links' }
  | { type: 'tag'; tagId: number };

interface SidebarProps {
  tags: Tag[];
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onRenameTag: (oldName: string, newName: string) => void;
  onDeleteTag: (tagId: number) => void;
  onUpdateTagIcon: (tagId: number, icon: string | null) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ tags, activeFilter, onFilterChange, onRenameTag, onDeleteTag, onUpdateTagIcon, onOpenSettings }: SidebarProps) {
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [iconPickerTagId, setIconPickerTagId] = useState<number | null>(null);

  const isActive = (filter: FilterType) => {
    if (activeFilter.type === 'all' && filter.type === 'all') return true;
    if (activeFilter.type === 'untagged' && filter.type === 'untagged') return true;
    if (activeFilter.type === 'archive' && filter.type === 'archive') return true;
    if (activeFilter.type === 'links' && filter.type === 'links') return true;
    if (
      activeFilter.type === 'tag' &&
      filter.type === 'tag' &&
      activeFilter.tagId === filter.tagId
    ) {
      return true;
    }
    return false;
  };

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
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <button
          className={`sidebar-tab ${isActive({ type: 'all' }) ? 'sidebar-tab-active' : ''}`}
          onClick={() => { onFilterChange({ type: 'all' }); }}
        >
          Notes
        </button>

        {tags.map((tag) => (
          <div key={tag.id} className="sidebar-tag-item">
            {editingTagId === tag.id ? (
              <input
                type="text"
                className="sidebar-tag-input"
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
                <div className="sidebar-tag-icon-wrapper" style={{ position: 'relative' }}>
                  <button
                    className="sidebar-tag-icon-btn"
                    onClick={() => { setIconPickerTagId(iconPickerTagId === tag.id ? null : tag.id); }}
                    title="Change tag icon"
                    aria-label={`Change icon for ${tag.name}`}
                  >
                    <Icon name={tag.icon ?? 'label'} size={18} />
                  </button>
                  {iconPickerTagId === tag.id && (
                    <IconPicker
                      onSelect={(iconName) => {
                        onUpdateTagIcon(tag.id, iconName);
                        setIconPickerTagId(null);
                      }}
                      onClose={() => { setIconPickerTagId(null); }}
                    />
                  )}
                </div>
                <button
                  className={`sidebar-tab sidebar-tag-name ${isActive({ type: 'tag', tagId: tag.id }) ? 'sidebar-tab-active' : ''}`}
                  onClick={() => { onFilterChange({ type: 'tag', tagId: tag.id }); }}
                  onDoubleClick={() => { handleStartEdit(tag); }}
                >
                  {tag.name}
                </button>
                <button
                  className="sidebar-tag-delete"
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
          className={`sidebar-tab ${isActive({ type: 'untagged' }) ? 'sidebar-tab-active' : ''}`}
          onClick={() => { onFilterChange({ type: 'untagged' }); }}
        >
          Untagged
        </button>

        <button
          className={`sidebar-tab ${isActive({ type: 'links' }) ? 'sidebar-tab-active' : ''}`}
          onClick={() => { onFilterChange({ type: 'links' }); }}
        >
          <Icon name="link" size={18} /> Links
        </button>

        <button
          className={`sidebar-tab ${isActive({ type: 'archive' }) ? 'sidebar-tab-active' : ''}`}
          onClick={() => { onFilterChange({ type: 'archive' }); }}
        >
          Archive
        </button>
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-settings-btn" onClick={onOpenSettings} aria-label="Open settings">
          <Icon name="settings" size={20} />
        </button>
      </div>
    </aside>
  );
}
