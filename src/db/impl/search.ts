import type { KeeperDB, SearchOptions, SearchResult } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createSearchMethods(ctx: KeeperDBContext): Pick<KeeperDB, "search"> {
  const { db, prepareFts5Query, rowNumber, rowToNote, withTagsBatch } = ctx;

  return {
    search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
      const fts5Query = prepareFts5Query(query);
      if (fts5Query === "") return Promise.resolve([]);

      const trashed = options.trashed === true ? 1 : 0;

      const rows = db.query(
        `SELECT n.*, rank
         FROM notes_fts fts
         JOIN notes n ON n.rowid = fts.rowid
         WHERE notes_fts MATCH ? AND n.trashed = ?
         ORDER BY n.archived ASC, rank`,
        [fts5Query, trashed],
      );
      const notesWithTags = withTagsBatch(rows.map(rowToNote));
      return Promise.resolve(notesWithTags.map((n, i) => {
        const row = rows[i];
        return {
          ...n,
          rank: row === undefined ? 0 : rowNumber(row, "rank"),
        };
      }));
    },
  };
}
