import type { KeeperDB, SearchResult } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createSearchMethods(ctx: KeeperDBContext): Pick<KeeperDB, "search"> {
  const { db, prepareFts5Query, rowToNote, withTagsBatch } = ctx;

  return {
    search(query: string): Promise<SearchResult[]> {
      const fts5Query = prepareFts5Query(query);
      if (fts5Query === "") return Promise.resolve([]);

      const rows = db.query(
        `SELECT n.*, rank
         FROM notes_fts fts
         JOIN notes n ON n.rowid = fts.rowid
         WHERE notes_fts MATCH ? AND n.trashed = 0
         ORDER BY n.archived ASC, rank`,
        [fts5Query],
      );
      const notesWithTags = withTagsBatch(rows.map(rowToNote));
      return Promise.resolve(notesWithTags.map((n, i) => {
        const row = rows[i];
        return {
          ...n,
          rank: (row != null ? row["rank"] : 0) as number,
        };
      }));
    },
  };
}
