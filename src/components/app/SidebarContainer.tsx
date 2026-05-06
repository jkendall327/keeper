import { Sidebar, type FilterType } from '../Sidebar.tsx';
import type { useDB } from '../../hooks/useDB.ts';

type DB = ReturnType<typeof useDB>;

type SidebarDb = Pick<
  DB,
  'allTags' | 'renameTag' | 'updateTagIcon' | 'deleteTag'
>;

interface SidebarContainerProps {
  activeFilter: FilterType;
  clearSelectedNotes: () => void;
  db: SidebarDb;
  isMobile: boolean;
  onOpenSettings: () => void;
  onSidebarClose: () => void;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  sidebarOpen: boolean;
}

export function SidebarContainer({
  activeFilter,
  clearSelectedNotes,
  db,
  isMobile,
  onOpenSettings,
  onSidebarClose,
  setActiveFilter,
  sidebarOpen,
}: SidebarContainerProps) {
  return (
    <Sidebar
      tags={db.allTags}
      activeFilter={activeFilter}
      onFilterChange={(filter) => {
        setActiveFilter(filter);
        clearSelectedNotes();
        if (isMobile) onSidebarClose();
      }}
      onRenameTag={(old, new_) => {
        db.renameTag(old, new_).catch((err: unknown) => {
          console.error('Failed to rename tag:', err);
        });
      }}
      onDeleteTag={(id) => {
        // Reset filter if the deleted tag is the active filter
        if (activeFilter.type === 'tag' && activeFilter.tagId === id) {
          setActiveFilter({ type: 'all' });
        }
        db.deleteTag(id).catch((err: unknown) => {
          console.error('Failed to delete tag:', err);
        });
      }}
      onUpdateTagIcon={(id, icon) => {
        db.updateTagIcon(id, icon).catch((err: unknown) => {
          console.error('Failed to update tag icon:', err);
        });
      }}
      onOpenSettings={() => {
        onOpenSettings();
        if (isMobile) onSidebarClose();
      }}
      isOpen={sidebarOpen}
    />
  );
}
