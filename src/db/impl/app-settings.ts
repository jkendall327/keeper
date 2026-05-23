import { normalizePopularTagSuggestionLimit } from "../types.ts";
import type { AppSettings, KeeperDB, UpdateAppSettingsInput } from "../types.ts";
import { normalizeExtensionTitleMaxLength } from "../../utils/extension-title.ts";
import type { KeeperDBContext } from "./context.ts";

export function createAppSettingsMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  "getAppSettings" | "updateAppSettings"
> {
  const { db, getAppSettingsSync, now } = ctx;

  function upsertSetting(key: string, value: string): void {
    db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now()],
    );
  }

  return {
    getAppSettings(): Promise<AppSettings> {
      return Promise.resolve(getAppSettingsSync());
    },

    updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
      const current = getAppSettingsSync();
      const extensionTitleMaxLength = input.extensionTitleMaxLength === undefined
        ? current.extensionTitleMaxLength
        : normalizeExtensionTitleMaxLength(input.extensionTitleMaxLength);
      const extensionBadgeEnabled = input.extensionBadgeEnabled ?? current.extensionBadgeEnabled;
      const linkPreviewFetchEnabled = input.linkPreviewFetchEnabled ?? current.linkPreviewFetchEnabled;
      const linkPreviewDisplayEnabled = input.linkPreviewDisplayEnabled ?? current.linkPreviewDisplayEnabled;
      const popularTagSuggestionsEnabled = input.popularTagSuggestionsEnabled ?? current.popularTagSuggestionsEnabled;
      const popularTagSuggestionLimit = input.popularTagSuggestionLimit === undefined
        ? current.popularTagSuggestionLimit
        : normalizePopularTagSuggestionLimit(input.popularTagSuggestionLimit);
      const quickAddAutofocusEnabled = input.quickAddAutofocusEnabled ?? current.quickAddAutofocusEnabled;
      const cleanupAutoTagRulesEnabled = input.cleanupAutoTagRulesEnabled ?? current.cleanupAutoTagRulesEnabled;
      const cleanupArchiveTaggedEnabled = input.cleanupArchiveTaggedEnabled ?? current.cleanupArchiveTaggedEnabled;
      const advancedModeEnabled = input.advancedModeEnabled ?? current.advancedModeEnabled;

      upsertSetting("extensionTitleMaxLength", String(extensionTitleMaxLength));
      upsertSetting("extensionBadgeEnabled", String(extensionBadgeEnabled));
      upsertSetting("linkPreviewFetchEnabled", String(linkPreviewFetchEnabled));
      upsertSetting("linkPreviewDisplayEnabled", String(linkPreviewDisplayEnabled));
      upsertSetting("popularTagSuggestionsEnabled", String(popularTagSuggestionsEnabled));
      upsertSetting("popularTagSuggestionLimit", String(popularTagSuggestionLimit));
      upsertSetting("quickAddAutofocusEnabled", String(quickAddAutofocusEnabled));
      upsertSetting("cleanupAutoTagRulesEnabled", String(cleanupAutoTagRulesEnabled));
      upsertSetting("cleanupArchiveTaggedEnabled", String(cleanupArchiveTaggedEnabled));
      upsertSetting("advancedModeEnabled", String(advancedModeEnabled));

      return Promise.resolve({
        extensionTitleMaxLength,
        extensionBadgeEnabled,
        linkPreviewFetchEnabled,
        linkPreviewDisplayEnabled,
        popularTagSuggestionsEnabled,
        popularTagSuggestionLimit,
        quickAddAutofocusEnabled,
        cleanupAutoTagRulesEnabled,
        cleanupArchiveTaggedEnabled,
        advancedModeEnabled,
      });
    },
  };
}
