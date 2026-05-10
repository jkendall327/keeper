import { Sidebar } from '../Sidebar.tsx';
import { useKeeperRouteState } from '../../hooks/useKeeperRouteState.ts';
import { useTagMutations, useTags } from '../../hooks/useKeeperQuery.ts';

interface SidebarContainerProps {
  clearSelectedNotes: () => void;
  isMobile: boolean;
  onOpenSettings: () => void;
  onSidebarClose: () => void;
  sidebarOpen: boolean;
}

export function SidebarContainer({
  clearSelectedNotes,
  isMobile,
  onOpenSettings,
  onSidebarClose,
  sidebarOpen,
}: SidebarContainerProps) {
  const { data: allTags } = useTags();
  const { deleteTag, renameTag, updateTagIcon } = useTagMutations();
  const { activeFilter, navigateToFilter } = useKeeperRouteState();

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
