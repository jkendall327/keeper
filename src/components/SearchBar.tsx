import { forwardRef, startTransition, useOptimistic } from 'react';
import { Icon } from './Icon.tsx';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  isMobile?: boolean;
  value: string;
  onChange: (query: string) => Promise<void>;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ isMobile = false, value, onChange }, ref) {
    const [inputValue, setInputValue] = useOptimistic(value);
    const changeQuery = (query: string) => {
      startTransition(async () => {
        // Echo typing immediately while the URL and results catch up. Keeping
        // the navigation promise in this Action also handles overlapping edits.
        setInputValue(query);
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
