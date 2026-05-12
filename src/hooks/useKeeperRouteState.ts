import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { FilterType } from '../components/Sidebar.tsx';

export function useKeeperRouteState() {
  const navigate = useNavigate();
  const activeFilter = useRouterState({
    select: (state) => filterFromRouteMatch(state.matches[state.matches.length - 1]),
  });
  const searchQuery = useRouterState({
    select: (state) => typeof state.location.search.q === 'string' ? state.location.search.q : '',
  });

  const navigateToFilter = (filter: FilterType) => {
    if (filter.type === 'tag') {
      void navigate({
        to: '/tag/$tagId',
        params: { tagId: filter.tagId },
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

interface KeeperRouteMatch {
  fullPath: string;
  params: Record<string, unknown>;
}

function filterFromRouteMatch(match: KeeperRouteMatch | undefined): FilterType {
  switch (match?.fullPath) {
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
    case '/tag/$tagId':
      return { type: 'tag', tagId: routeNumberParam(match, 'tagId') };
    case '/inbox':
    default:
      return { type: 'all' };
  }
}

function routeNumberParam(match: KeeperRouteMatch, name: string): number {
  const value = match.params[name];
  if (typeof value !== 'number') {
    throw new Error(`Route param ${name} was not parsed as a number`);
  }
  return value;
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
