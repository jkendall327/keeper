import { useEffect, useMemo, useState } from 'react';

export function useIsMobile() {
  const query = useMemo(() => window.matchMedia('(max-width: 768px)'), []);
  const [isMobile, setIsMobile] = useState(query.matches);

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    query.addEventListener('change', handler);
    return () => {
      query.removeEventListener('change', handler);
    };
  }, [query]);

  return isMobile;
}
