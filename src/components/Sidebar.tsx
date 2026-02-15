import type { Tag } from '../db/types.ts';

export type FilterType =
  | { type: 'all' }
  | { type: 'untagged' }
  | { type: 'tag'; tagId: number };

interface SidebarProps {
  tags: Tag[];
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

export function Sidebar({ tags, activeFilter, onFilterChange }: SidebarProps) {
  const isActive = (filter: FilterType) => {
    if (activeFilter.type === 'all' && filter.type === 'all') return true;
    if (activeFilter.type === 'untagged' && filter.type === 'untagged') return true;
    if (
      activeFilter.type === 'tag' &&
      filter.type === 'tag' &&
      activeFilter.tagId === filter.tagId
    ) {
      return true;
    }
    return false;
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
          <button
            key={tag.id}
            className={`sidebar-tab ${isActive({ type: 'tag', tagId: tag.id }) ? 'sidebar-tab-active' : ''}`}
            onClick={() => { onFilterChange({ type: 'tag', tagId: tag.id }); }}
          >
            {tag.name}
          </button>
        ))}

        <button
          className={`sidebar-tab ${isActive({ type: 'untagged' }) ? 'sidebar-tab-active' : ''}`}
          onClick={() => { onFilterChange({ type: 'untagged' }); }}
        >
          Archive
        </button>
      </nav>
    </aside>
  );
}
