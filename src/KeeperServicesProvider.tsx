import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { KeeperServicesContext, type KeeperServices } from './services.ts';

interface KeeperServicesProviderProps {
  children: ReactNode;
  value: KeeperServices;
}

export function KeeperServicesProvider({ children, value }: KeeperServicesProviderProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <KeeperServicesContext.Provider value={value}>
        {children}
      </KeeperServicesContext.Provider>
    </QueryClientProvider>
  );
}
