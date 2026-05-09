import { useCallback, useEffect, useState } from 'react';
import { useKeeperServices } from '../services.ts';
import {
  DEFAULT_EXTENSION_TITLE_MAX_LENGTH,
  DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT,
  type AppSettings,
} from '../db/types.ts';

const DEFAULT_APP_SETTINGS: AppSettings = {
  extensionTitleMaxLength: DEFAULT_EXTENSION_TITLE_MAX_LENGTH,
  extensionBadgeEnabled: true,
  linkPreviewFetchEnabled: true,
  linkPreviewDisplayEnabled: true,
  popularTagSuggestionsEnabled: true,
  popularTagSuggestionLimit: DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT,
};

export function useAppSettings() {
  const { db } = useKeeperServices();
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);

  const applyAppSettings = useCallback((settings: AppSettings) => {
    setAppSettings(settings);
    setAppSettingsLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const settings = await db.getAppSettings();
      if (!cancelled) {
        setAppSettings(settings);
        setAppSettingsLoaded(true);
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [db]);

  return {
    appSettings,
    appSettingsLoaded,
    onAppSettingsChange: applyAppSettings,
  };
}
