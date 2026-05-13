import { forwardRef } from 'react';
import { Icon } from './Icon.tsx';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  isMobile?: boolean;
  value: string;
  onChange: (query: string) => void;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ isMobile = false, value, onChange }, ref) {
    return (
      <div className={styles.bar}>
        <input
          ref={ref}
          type="text"
          className={styles.barInput}
          placeholder={isMobile ? 'Search notes...' : 'Search notes... (Ctrl+/)'}
          aria-label="Search notes"
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value !== '') {
              e.preventDefault();
              onChange('');
            }
          }}
        />
        {value !== '' && (
          <button
            className={styles.clear}
            onClick={() => { onChange(''); }}
            aria-label="Clear search"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    );
  },
);
