import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { FilterType } from '../components/Sidebar.tsx';

export function useKeeperRouteState() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchQuery = useRouterState({
    select: (state) => typeof state.location.search.q === 'string' ? state.location.search.q : '',
  });
  const activeFilter = filterFromPath(pathname);

  const navigateToFilter = (filter: FilterType) => {
    if (filter.type === 'tag') {
      void navigate({
        to: '/tag/$tagId',
        params: { tagId: String(filter.tagId) },
        search: (previousSearch) => previousSearch,
      });
      return;
    }

    void navigate({
      to: filterToPath(filter),
      search: (previousSearch) => previousSearch,
    });
  };

  const setSearchQuery = (query: string) => {
    void navigate({
      to: '.',
      search: (previousSearch) => query === '' ? {} : { ...previousSearch, q: query },
      replace: true,
    });
  };

  return {
    activeFilter,
    searchQuery,
    navigateToFilter,
    setSearchQuery,
  };
}

function filterFromPath(pathname: string): FilterType {
  if (pathname.startsWith('/tag/')) {
    return { type: 'tag', tagId: Number(pathname.slice('/tag/'.length)) };
  }

  switch (pathname) {
    case '/archive':
      return { type: 'archive' };
    case '/chat':
      return { type: 'chat' };
    case '/links':
      return { type: 'links' };
    case '/trash':
      return { type: 'trash' };
    case '/untagged':
      return { type: 'untagged' };
    case '/inbox':
    default:
      return { type: 'all' };
  }
}

function filterToPath(filter: Exclude<FilterType, { type: 'tag' }>) {
  switch (filter.type) {
    case 'all':
      return '/inbox';
    case 'archive':
      return '/archive';
    case 'chat':
      return '/chat';
    case 'links':
      return '/links';
    case 'trash':
      return '/trash';
    case 'untagged':
      return '/untagged';
  }
}
