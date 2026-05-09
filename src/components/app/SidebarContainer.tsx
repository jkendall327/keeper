import { Sidebar, type FilterType } from '../Sidebar.tsx';
import { useTagMutations } from '../../hooks/useKeeperQuery.ts';
import type { Tag } from '../../db/types.ts';

interface SidebarContainerProps {
  activeFilter: FilterType;
  allTags: Tag[];
  clearSelectedNotes: () => void;
  isMobile: boolean;
  onOpenSettings: () => void;
  onSidebarClose: () => void;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  sidebarOpen: boolean;
}

export function SidebarContainer({
  activeFilter,
  allTags,
  clearSelectedNotes,
  isMobile,
  onOpenSettings,
  onSidebarClose,
  setActiveFilter,
  sidebarOpen,
}: SidebarContainerProps) {
  const { deleteTag, renameTag, updateTagIcon } = useTagMutations();

  return (
    <Sidebar
      tags={allTags}
      activeFilter={activeFilter}
      onFilterChange={(filter) => {
        setActiveFilter(filter);
        clearSelectedNotes();
        if (isMobile) onSidebarClose();
      }}
      onRenameTag={(old, new_) => {
        renameTag(old, new_).catch((err: unknown) => {
          console.error('Failed to rename tag:', err);
        });
      }}
      onDeleteTag={(id) => {
        // Reset filter if the deleted tag is the active filter
        if (activeFilter.type === 'tag' && activeFilter.tagId === id) {
          setActiveFilter({ type: 'all' });
        }
        deleteTag(id).catch((err: unknown) => {
          console.error('Failed to delete tag:', err);
        });
      }}
      onUpdateTagIcon={(id, icon) => {
        updateTagIcon(id, icon).catch((err: unknown) => {
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
