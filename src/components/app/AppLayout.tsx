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
        <button
          type="button"
          className={styles.sidebarOverlay}
          onClick={onSidebarClose}
          aria-label="Close sidebar"
        />
      )}
      {sidebar}
      <div className={styles.content}>{children}</div>
      {settingsModal}
    </div>
  );
}
