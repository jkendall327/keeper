import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { FilterType } from '../components/Sidebar.tsx';
import { useTags } from './useKeeperQuery.ts';

export function useKeeperRouteState() {
  const navigate = useNavigate();
  const { data: allTags } = useTags();
  const routeMatch = useRouterState({
    select: (state) => state.matches[state.matches.length - 1],
  });
  const activeFilter = filterFromRouteMatch(routeMatch, allTags);
  const searchQuery = useRouterState({
    select: (state) => typeof state.location.search.q === 'string' ? state.location.search.q : '',
  });

  const navigateToFilter = (filter: FilterType) => {
    if (filter.type === 'tag') {
      void navigate({
        to: '/tag/$tagName',
        params: { tagName: filter.tagName },
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

function filterFromRouteMatch(match: KeeperRouteMatch | undefined, allTags: { id: number; name: string }[]): FilterType {
  switch (match?.fullPath) {
    case '/archive':
      return { type: 'archive' };
    case '/chat':
      return { type: 'chat' };
    case '/links':
      return { type: 'links' };
    case '/duplicates':
      return { type: 'duplicates' };
    case '/trash':
      return { type: 'trash' };
    case '/untagged':
      return { type: 'untagged' };
    case '/tag/$tagName': {
      const tagName = routeStringParam(match, 'tagName');
      const tag = allTags.find((candidate) => candidate.name === tagName);
      return { type: 'tag', tagId: tag?.id ?? null, tagName };
    }
    case '/inbox':
    default:
      return { type: 'all' };
  }
}

function routeStringParam(match: KeeperRouteMatch, name: string): string {
  const value = match.params[name];
  if (typeof value !== 'string') {
    throw new Error(`Route param ${name} was not parsed as a string`);
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
    case 'duplicates':
      return '/duplicates';
    case 'trash':
      return '/trash';
    case 'untagged':
      return '/untagged';
  }
}
