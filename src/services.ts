import { createContext, useContext } from 'react';
import type { KeeperDB } from './db/types.ts';

export interface KeeperServices {
  db: KeeperDB;
  apiFetch: typeof fetch;
}

export const KeeperServicesContext = createContext<KeeperServices | null>(null);

export function useKeeperServices(): KeeperServices {
  const services = useContext(KeeperServicesContext);
  if (services === null) {
    throw new Error('useKeeperServices must be used within KeeperServicesProvider');
  }
  return services;
}
