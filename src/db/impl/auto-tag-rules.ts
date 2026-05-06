import { extractUrls } from "../url-detect.ts";
import type {
  AutoTagRule,
  AutoTagRuleInput,
  AutoTagRunResult,
  KeeperDB,
  UpdateAutoTagRuleInput,
} from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createAutoTagRuleMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  | "getAutoTagRules"
  | "createAutoTagRule"
  | "updateAutoTagRule"
  | "deleteAutoTagRule"
  | "runAutoTagRules"
> {
  const {
    db,
    ensureTag,
    getAutoTagRuleById,
    normalizeRuleInput,
    now,
    rowToNote,
    rowsToAutoTagRules,
  } = ctx;

  function getAutoTagRules(): Promise<AutoTagRule[]> {
    const rows = db.query(
      "SELECT * FROM auto_tag_rules ORDER BY created_at DESC, id DESC",
    );
    return Promise.resolve(rowsToAutoTagRules(rows));
  }

  return {
    getAutoTagRules,

    createAutoTagRule(input: AutoTagRuleInput): Promise<AutoTagRule> {
      try {
        const normalized = normalizeRuleInput(input);
        const timestamp = now();
        db.run(
          "INSERT INTO auto_tag_rules (pattern, created_at, updated_at) VALUES (?, ?, ?)",
          [normalized.pattern, timestamp, timestamp],
        );
        const row = db.query("SELECT last_insert_rowid() AS id")[0];
        if (row === undefined) throw new Error("Unable to create autotag rule");
        const ruleId = row["id"] as number;
        for (const tagName of normalized.tagNames) {
          db.run(
            "INSERT INTO auto_tag_rule_tags (rule_id, tag_name) VALUES (?, ?)",
            [ruleId, tagName],
          );
        }
        const created = getAutoTagRuleById(ruleId);
        if (created === null) throw new Error("Unable to read created autotag rule");
        return Promise.resolve(created);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error("Unable to create autotag rule"));
      }
    },

    updateAutoTagRule(input: UpdateAutoTagRuleInput): Promise<AutoTagRule> {
      try {
        const existing = getAutoTagRuleById(input.id);
        if (existing === null) throw new Error(`Autotag rule not found: ${String(input.id)}`);
        const normalized = normalizeRuleInput(input);
        db.run(
          "UPDATE auto_tag_rules SET pattern = ?, updated_at = ? WHERE id = ?",
          [normalized.pattern, now(), input.id],
        );
        db.run("DELETE FROM auto_tag_rule_tags WHERE rule_id = ?", [input.id]);
        for (const tagName of normalized.tagNames) {
          db.run(
            "INSERT INTO auto_tag_rule_tags (rule_id, tag_name) VALUES (?, ?)",
            [input.id, tagName],
          );
        }
        const updated = getAutoTagRuleById(input.id);
        if (updated === null) throw new Error(`Autotag rule not found: ${String(input.id)}`);
        return Promise.resolve(updated);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error("Unable to update autotag rule"));
      }
    },

    deleteAutoTagRule(id: number): Promise<void> {
      db.run("DELETE FROM auto_tag_rules WHERE id = ?", [id]);
      return Promise.resolve();
    },

    async runAutoTagRules(): Promise<AutoTagRunResult> {
      const rules = await getAutoTagRules();
      if (rules.length === 0) {
        return { matchedNoteCount: 0, archivedNoteCount: 0, appliedTagCount: 0 };
      }

      const compiledRules = rules.map((rule) => ({
        tagNames: rule.tagNames,
        regex: new RegExp(rule.pattern, "i"),
      }));
      const noteRows = db.query(
        "SELECT * FROM notes WHERE archived = 0 AND trashed = 0 ORDER BY updated_at DESC",
      );

      let matchedNoteCount = 0;
      let archivedNoteCount = 0;
      let appliedTagCount = 0;

      for (const row of noteRows) {
        const note = rowToNote(row);
        const urls = extractUrls(note.body);
        if (urls.length === 0) continue;

        const matchedTagNames = new Set<string>();
        for (const rule of compiledRules) {
          if (urls.some((url) => rule.regex.test(url))) {
            for (const tagName of rule.tagNames) {
              matchedTagNames.add(tagName);
            }
          }
        }
        if (matchedTagNames.size === 0) continue;

        matchedNoteCount++;
        for (const tagName of matchedTagNames) {
          const tagId = ensureTag(tagName);
          const before = db.query(
            "SELECT 1 FROM note_tags WHERE note_id = ? AND tag_id = ?",
            [note.id, tagId],
          );
          db.run(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
            [note.id, tagId],
          );
          if (before.length === 0) appliedTagCount++;
        }
        db.run("UPDATE notes SET archived = 1, updated_at = ? WHERE id = ?", [
          now(),
          note.id,
        ]);
        archivedNoteCount++;
      }

      return { matchedNoteCount, archivedNoteCount, appliedTagCount };
    },
  };
}
