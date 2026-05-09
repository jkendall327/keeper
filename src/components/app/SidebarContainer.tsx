import { Sidebar, type FilterType } from '../Sidebar.tsx';
import { useTagMutations } from '../../hooks/useKeeperQuery.ts';
import type { Tag } from '../../db/types.ts';

interface SidebarContainerProps {
  activeFilter: FilterType;
  allTags: Tag[];
  clearSelectedNotes: () => void;
  isMobile: boolean;
  navigateToFilter: (filter: FilterType) => void;
  onOpenSettings: () => void;
  onSidebarClose: () => void;
  sidebarOpen: boolean;
}

export function SidebarContainer({
  activeFilter,
  allTags,
  clearSelectedNotes,
  isMobile,
  navigateToFilter,
  onOpenSettings,
  onSidebarClose,
  sidebarOpen,
}: SidebarContainerProps) {
  const { deleteTag, renameTag, updateTagIcon } = useTagMutations();

  return (
    <Sidebar
      tags={allTags}
      activeFilter={activeFilter}
      onFilterChange={(filter) => {
        navigateToFilter(filter);
        clearSelectedNotes();
        if (isMobile) onSidebarClose();
      }}
      onRenameTag={(old, new_) => {
        renameTag(old, new_).catch((err: unknown) => {
          console.error('Failed to rename tag:', err);
        });
      }}
      onDeleteTag={(id) => {
        if (activeFilter.type === 'tag' && activeFilter.tagId === id) {
          navigateToFilter({ type: 'all' });
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
