import { migrate } from "./migrations.ts";
import type { KeeperDB } from "./types.ts";
import { createAppSettingsMethods } from "./impl/app-settings.ts";
import { createAutoTagRuleMethods } from "./impl/auto-tag-rules.ts";
import { createKeeperDBContext } from "./impl/context.ts";
import type { KeeperDBDeps } from "./impl/context.ts";
import { createLinkMetadataMethods } from "./impl/link-metadata.ts";
import { createMediaMethods } from "./impl/media.ts";
import { createNoteMethods } from "./impl/notes.ts";
import { createSearchMethods } from "./impl/search.ts";
import { createSmartViewMethods } from "./impl/smart-views.ts";
import { createTagMethods } from "./impl/tags.ts";
import { createTrashMethods } from "./impl/trash.ts";

export type { KeeperDBDeps } from "./impl/context.ts";

export function createKeeperDB(deps: KeeperDBDeps): KeeperDB {
  migrate(deps.db);

  const ctx = createKeeperDBContext(deps);
  const notes = createNoteMethods(ctx);

  return {
    ...notes,
    ...createTagMethods(ctx, notes.getNote),
    ...createSearchMethods(ctx),
    ...createTrashMethods(ctx),
    ...createSmartViewMethods(ctx),
    ...createAutoTagRuleMethods(ctx),
    ...createAppSettingsMethods(ctx),
    ...createMediaMethods(ctx),
    ...createLinkMetadataMethods(ctx),
  };
}
