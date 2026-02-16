import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './Icon.tsx';

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

const STORAGE_KEY = 'keeper-recent-icons';
const MAX_RECENT = 8;

function getRecentIcons(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentIcon(icon: string): boolean {
  try {
    const recent = getRecentIcons().filter((i) => i !== icon);
    recent.unshift(icon);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
    return true;
  } catch (err: unknown) {
    console.warn('Failed to save recent icon:', err);
    return false;
  }
}

interface IconPickerProps {
  onSelect: (iconName: string) => void;
  onClose: () => void;
}

export function IconPicker({ onSelect, onClose }: IconPickerProps) {
  const [search, setSearch] = useState('');
  const [recentIcons] = useState(getRecentIcons);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (search.trim() === '') return ICON_LIST;
    const q = search.trim().toLowerCase();
    return ICON_LIST.filter((name) => name.includes(q));
  }, [search]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current !== null && !popoverRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  const handleSelect = (iconName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveRecentIcon(iconName);
    onSelect(iconName);
  };

  return (
    <div className="icon-picker" ref={popoverRef} role="dialog" aria-label="Choose an icon">
      <input
        ref={searchRef}
        type="text"
        className="icon-picker-search"
        placeholder="Search icons..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); }}
      />
      {recentIcons.length > 0 && search.trim() === '' && (
        <div className="icon-picker-section">
          <div className="icon-picker-section-label">Recent</div>
          <div className="icon-picker-grid">
            {recentIcons.map((name) => (
              <button
                key={name}
                className="icon-picker-item"
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
      <div className="icon-picker-section">
        <div className="icon-picker-grid">
          {filtered.map((name) => (
            <button
              key={name}
              className="icon-picker-item"
              title={name}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { handleSelect(name, e); }}
            >
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="icon-picker-empty">No matching icons</div>
        )}
      </div>
    </div>
  );
}
