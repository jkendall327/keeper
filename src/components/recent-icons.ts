const STORAGE_KEY = "keeper-recent-icons";
const MAX_RECENT = 8;

export function getRecentIcons(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentIcon(icon: string): boolean {
  try {
    const recent = getRecentIcons().filter((i) => i !== icon);
    recent.unshift(icon);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT)),
    );
    return true;
  } catch (err: unknown) {
    console.warn("Failed to save recent icon:", err);
    return false;
  }
}
