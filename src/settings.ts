const AUTO_APPLY_ACTIVE_TAG_KEY = 'keeper-auto-apply-active-tag';

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
}
