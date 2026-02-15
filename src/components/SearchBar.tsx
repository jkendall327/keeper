interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        className="search-bar-input"
        placeholder="Search notes..."
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
      />
      {value && (
        <button
          className="search-bar-clear"
          onClick={() => { onChange(''); }}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
