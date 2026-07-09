import { Sidebar } from '../Sidebar.tsx';
import { useKeeperRouteState } from '../../hooks/useKeeperRouteState.ts';
import { useTagMutations, useTags } from '../../hooks/useKeeperQuery.ts';

interface SidebarContainerProps {
  advancedModeEnabled: boolean;
  clearSelectedNotes: () => void;
  isMobile: boolean;
  onOpenSettings: () => void;
  onSidebarClose: () => void;
  sidebarOpen: boolean;
}

export function SidebarContainer({
  advancedModeEnabled,
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
      advancedModeEnabled={advancedModeEnabled}
      onFilterChange={(filter) => {
        navigateToFilter(filter);
        clearSelectedNotes();
        if (isMobile) onSidebarClose();
      }}
      onRenameTag={(old, new_) => {
        const renamedActiveTag = activeFilter.type === 'tag' && activeFilter.tagName === old;
        renameTag(old, new_).then(() => {
          if (renamedActiveTag) {
            navigateToFilter({ type: 'tag', tagId: activeFilter.tagId, tagName: new_ });
          }
        }).catch((err: unknown) => {
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
