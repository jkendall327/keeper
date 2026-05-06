import type { ReactNode } from 'react';
import styles from '../../App.module.css';

interface AppLayoutProps {
  children: ReactNode;
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  isMobile: boolean;
  settingsModal: ReactNode;
  sidebar: ReactNode;
}

export function AppLayout({
  children,
  isMobile,
  onSidebarClose,
  settingsModal,
  sidebar,
  sidebarOpen,
}: AppLayoutProps) {
  return (
    <div className={styles.layout}>
      {isMobile && sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={onSidebarClose} />
      )}
      {sidebar}
      <div className={styles.content}>{children}</div>
      {settingsModal}
    </div>
  );
}
