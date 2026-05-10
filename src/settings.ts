import { useEffect, useState } from 'react';

const AUTO_APPLY_ACTIVE_TAG_KEY = 'keeper-auto-apply-active-tag';
const AUTO_APPLY_ACTIVE_TAG_EVENT = 'keeper-auto-apply-active-tag-change';

export function getAutoApplyActiveTag(): boolean {
  try {
    return localStorage.getItem(AUTO_APPLY_ACTIVE_TAG_KEY) !== 'false';
  } catch (err: unknown) {
    console.warn('Failed to read active tag preference from localStorage:', err);
    return true;
  }
}

export function setAutoApplyActiveTag(enabled: boolean): void {
  localStorage.setItem(AUTO_APPLY_ACTIVE_TAG_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(AUTO_APPLY_ACTIVE_TAG_EVENT, { detail: enabled }));
}

export function useAutoApplyActiveTag() {
  const [autoApplyActiveTag, setAutoApplyActiveTagState] = useState(getAutoApplyActiveTag);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTO_APPLY_ACTIVE_TAG_KEY) {
        setAutoApplyActiveTagState(getAutoApplyActiveTag());
      }
    };
    const handlePreferenceChange = (event: Event) => {
      setAutoApplyActiveTagState((event as CustomEvent<boolean>).detail);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(AUTO_APPLY_ACTIVE_TAG_EVENT, handlePreferenceChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(AUTO_APPLY_ACTIVE_TAG_EVENT, handlePreferenceChange);
    };
  }, []);

  return [autoApplyActiveTag, setAutoApplyActiveTag] as const;
}
