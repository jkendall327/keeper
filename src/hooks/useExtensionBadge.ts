import { useCallback, useEffect, useRef, useState } from 'react';
import { getDB } from '../db/db-client.ts';
import { DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT, type AppSettings } from '../db/types.ts';

export function useExtensionBadge(extensionNoteCreatedCount: number) {
  const [extensionBadgeEnabled, setExtensionBadgeEnabled] = useState(true);
  const [linkPreviewFetchEnabled, setLinkPreviewFetchEnabled] = useState(true);
  const [linkPreviewDisplayEnabled, setLinkPreviewDisplayEnabled] = useState(true);
  const [popularTagSuggestionsEnabled, setPopularTagSuggestionsEnabled] = useState(true);
  const [popularTagSuggestionLimit, setPopularTagSuggestionLimit] = useState(DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT);
  const [unseenExtensionNoteCount, setUnseenExtensionNoteCount] = useState(0);
  const previousExtensionNoteCreatedCount = useRef(extensionNoteCreatedCount);
  const titleBase = useRef(document.title);

  const applyAppSettings = useCallback((settings: AppSettings) => {
    setExtensionBadgeEnabled(settings.extensionBadgeEnabled);
    if (!settings.extensionBadgeEnabled) setUnseenExtensionNoteCount(0);
    setLinkPreviewFetchEnabled(settings.linkPreviewFetchEnabled);
    setLinkPreviewDisplayEnabled(settings.linkPreviewDisplayEnabled);
    setPopularTagSuggestionsEnabled(settings.popularTagSuggestionsEnabled);
    setPopularTagSuggestionLimit(settings.popularTagSuggestionLimit);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const settings = await getDB().getAppSettings();
      if (cancelled) return;
      applyAppSettings(settings);
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [applyAppSettings]);

  useEffect(() => {
    const clearIfFocused = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        setUnseenExtensionNoteCount(0);
      }
    };
    window.addEventListener('focus', clearIfFocused);
    document.addEventListener('visibilitychange', clearIfFocused);
    clearIfFocused();
    return () => {
      window.removeEventListener('focus', clearIfFocused);
      document.removeEventListener('visibilitychange', clearIfFocused);
    };
  }, []);

  useEffect(() => {
    const previous = previousExtensionNoteCreatedCount.current;
    previousExtensionNoteCreatedCount.current = extensionNoteCreatedCount;
    const delta = extensionNoteCreatedCount - previous;
    if (delta <= 0 || !extensionBadgeEnabled) return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    setUnseenExtensionNoteCount((count) => count + delta);
  }, [extensionBadgeEnabled, extensionNoteCreatedCount]);

  useEffect(() => {
    if (!extensionBadgeEnabled) {
      document.title = titleBase.current;
      return;
    }
    document.title = unseenExtensionNoteCount > 0
      ? `(${String(unseenExtensionNoteCount)}) ${titleBase.current}`
      : titleBase.current;
  }, [extensionBadgeEnabled, unseenExtensionNoteCount]);

  return {
    extensionBadgeEnabled,
    linkPreviewDisplayEnabled,
    linkPreviewFetchEnabled,
    popularTagSuggestionsEnabled,
    popularTagSuggestionLimit,
    onAppSettingsChange: applyAppSettings,
  };
}
