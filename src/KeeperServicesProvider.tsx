import type { ReactNode } from 'react';
import { KeeperServicesContext, type KeeperServices } from './services.ts';

interface KeeperServicesProviderProps {
  children: ReactNode;
  value: KeeperServices;
}

export function KeeperServicesProvider({ children, value }: KeeperServicesProviderProps) {
  return (
    <KeeperServicesContext.Provider value={value}>
      {children}
    </KeeperServicesContext.Provider>
  );
}
