import { forwardRef, startTransition, useState } from 'react';
import { Icon } from './Icon.tsx';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  isMobile?: boolean;
  value: string;
  navigationKey: string | undefined;
  onChange: (query: string) => Promise<void>;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ isMobile = false, value, navigationKey, onChange }, ref) {
    const [draft, setDraft] = useState({ value, navigationKey, text: value });
    // Reconcile during render so a committed navigation supersedes local typing
    // before paint. The key also catches a shortcut clearing an already-empty URL.
    if (draft.value !== value || draft.navigationKey !== navigationKey) {
      setDraft({ value, navigationKey, text: value });
    }
    const inputValue = draft.value === value && draft.navigationKey === navigationKey
      ? draft.text
      : value;
    const changeQuery = (query: string) => {
      setDraft({ value, navigationKey, text: query });
      startTransition(async () => {
        await onChange(query);
      });
    };

    return (
      <div className={styles.bar}>
        <input
          ref={ref}
          type="text"
          className={styles.barInput}
          placeholder={isMobile ? 'Search notes...' : 'Search notes... (Ctrl+/)'}
          aria-label="Search notes"
          value={inputValue}
          onChange={(e) => { changeQuery(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && inputValue !== '') {
              e.preventDefault();
              changeQuery('');
            }
          }}
        />
        {inputValue !== '' && (
          <button
            className={styles.clear}
            onClick={() => { changeQuery(''); }}
            aria-label="Clear search"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    );
  },
);
