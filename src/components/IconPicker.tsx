import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.tsx';
import { getRecentIcons, saveRecentIcon } from './recent-icons.ts';
import styles from './IconPicker.module.css';

const PICKER_VIEWPORT_PADDING = 8;

const ICON_LIST = [
  'home', 'star', 'favorite', 'bookmark', 'label', 'flag',
  'push_pin', 'lightbulb', 'check_circle', 'info', 'warning', 'error',
  'schedule', 'event', 'calendar_today', 'alarm', 'timer', 'history',
  'person', 'group', 'face', 'mood', 'sentiment_satisfied', 'psychology',
  'work', 'school', 'business', 'account_balance', 'store', 'apartment',
  'shopping_cart', 'payments', 'credit_card', 'receipt', 'savings', 'wallet',
  'mail', 'call', 'chat', 'forum', 'send', 'notifications',
  'edit', 'delete', 'add', 'remove', 'content_copy', 'content_paste',
  'folder', 'description', 'article', 'note', 'sticky_note_2', 'task',
  'search', 'visibility', 'visibility_off', 'filter_list', 'sort', 'tune',
  'settings', 'build', 'code', 'terminal', 'bug_report', 'data_object',
  'link', 'language', 'public', 'cloud', 'download', 'upload',
  'image', 'photo_camera', 'videocam', 'mic', 'headphones', 'music_note',
  'play_arrow', 'pause', 'stop', 'skip_next', 'replay', 'shuffle',
  'location_on', 'map', 'explore', 'navigation', 'flight', 'directions_car',
  'restaurant', 'local_cafe', 'local_bar', 'cake', 'egg', 'nutrition',
  'fitness_center', 'sports', 'pool', 'hiking', 'self_improvement', 'spa',
  'pets', 'park', 'forest', 'eco', 'water_drop', 'wb_sunny',
  'nightlight', 'thermostat', 'bolt', 'rocket_launch', 'science', 'biotech',
  'palette', 'brush', 'draw', 'design_services', 'auto_fix_high', 'theater_comedy',
  'menu_book', 'library_books', 'auto_stories', 'newspaper', 'feed', 'rss_feed',
  'health_and_safety', 'medical_services', 'local_hospital', 'medication', 'vaccines', 'monitor_heart',
  'attach_money', 'trending_up', 'trending_down', 'analytics', 'pie_chart', 'bar_chart',
  'lock', 'key', 'shield', 'security', 'vpn_key', 'admin_panel_settings',
  'emoji_objects', 'emoji_events', 'emoji_nature', 'emoji_transportation', 'emoji_food_beverage', 'emoji_symbols',
  'thumb_up', 'thumb_down', 'celebration', 'handshake', 'volunteer_activism', 'diversity_3',
  'priority_high', 'new_releases', 'verified', 'grade', 'military_tech', 'workspace_premium',
];

interface IconPickerProps {
  onSelect: (iconName: string) => void;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
}

export function IconPicker({ onSelect, onClose, anchorEl }: IconPickerProps) {
  const [search, setSearch] = useState('');
  const [recentIcons] = useState(getRecentIcons);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchQuery = search.trim().toLowerCase();
  const filtered = searchQuery === ''
    ? ICON_LIST
    : ICON_LIST.filter((name) => name.includes(searchQuery));

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (anchorEl === undefined || anchorEl === null || popover === null) return;

    const rect = anchorEl.getBoundingClientRect();
    const pickerWidth = popover.offsetWidth;
    const pickerHeight = popover.offsetHeight;
    const viewportLeft = window.scrollX + PICKER_VIEWPORT_PADDING;
    const viewportRight = window.scrollX + document.documentElement.clientWidth - PICKER_VIEWPORT_PADDING;
    const viewportTop = window.scrollY + PICKER_VIEWPORT_PADDING;
    const viewportBottom = window.scrollY + document.documentElement.clientHeight - PICKER_VIEWPORT_PADDING;
    const preferredTop = rect.bottom + window.scrollY + 4;
    const fallbackTop = rect.top + window.scrollY - pickerHeight - 4;
    const preferredLeft = rect.left + window.scrollX;
    const fallbackLeft = rect.right + window.scrollX - pickerWidth;
    const top = preferredTop + pickerHeight <= viewportBottom
      ? preferredTop
      : Math.max(viewportTop, fallbackTop);
    const left = preferredLeft + pickerWidth <= viewportRight
      ? Math.max(viewportLeft, preferredLeft)
      : Math.max(viewportLeft, fallbackLeft);

    popover.style.top = `${String(top)}px`;
    popover.style.left = `${String(left)}px`;
  }, [anchorEl]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current !== null && !popoverRef.current.contains(target)) {
        if (anchorEl?.contains(target) === true) return;
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, anchorEl]);

  const handleSelect = (iconName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveRecentIcon(iconName);
    onSelect(iconName);
  };

  const picker = (
    <div className={styles.picker} ref={popoverRef} role="dialog" aria-label="Choose an icon">
      <input
        ref={searchRef}
        type="text"
        className={styles.search}
        placeholder="Search icons..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); }}
      />
      {recentIcons.length > 0 && search.trim() === '' && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Recent</div>
          <div className={styles.grid}>
            {recentIcons.map((name) => (
              <button
                key={name}
                className={styles.item}
                title={name}
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { handleSelect(name, e); }}
              >
                <Icon name={name} size={20} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.grid}>
          {filtered.map((name) => (
            <button
              key={name}
              className={styles.item}
              title={name}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { handleSelect(name, e); }}
            >
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className={styles.empty}>No matching icons</div>
        )}
      </div>
    </div>
  );

  return anchorEl === undefined ? picker : createPortal(picker, document.body);
}
