import { forwardRef } from 'react';
import { Icon } from './Icon.tsx';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ value, onChange }, ref) {
    return (
      <div className="search-bar">
        <input
          ref={ref}
          type="text"
          className="search-bar-input"
          placeholder="Search notes... (Ctrl+/)"
          aria-label="Search notes"
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
        />
        {value !== '' && (
          <button
            className="search-bar-clear"
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
