export const SCHEMA_SQL = `
-- Notes
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  has_links  INTEGER NOT NULL DEFAULT 0,
  pinned     INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  trashed    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_has_links ON notes(has_links);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(archived);
CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed);

-- FTS5 full-text search (external content, synced via triggers)
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  body,
  content='notes',
  content_rowid='rowid'
);

-- FTS5 sync triggers
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body)
  VALUES (NEW.rowid, NEW.title, NEW.body);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.body);
  INSERT INTO notes_fts(rowid, title, body)
  VALUES (NEW.rowid, NEW.title, NEW.body);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.body);
END;

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT NULL
);

-- Note–Tag junction
CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- Media
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  mime_type  TEXT NOT NULL,
  filename   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_note_id ON media(note_id);

-- Link metadata
CREATE TABLE IF NOT EXISTS note_links (
  note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  url       TEXT NOT NULL,
  position  INTEGER NOT NULL,
  PRIMARY KEY (note_id, url),
  UNIQUE (note_id, position)
);

CREATE INDEX IF NOT EXISTS idx_note_links_url ON note_links(url);
CREATE INDEX IF NOT EXISTS idx_note_links_note_position ON note_links(note_id, position);

CREATE TABLE IF NOT EXISTS link_metadata (
  url            TEXT PRIMARY KEY,
  image_url      TEXT,
  image_alt      TEXT,
  image_width    INTEGER,
  image_height   INTEGER,
  title          TEXT,
  site_name      TEXT,
  canonical_url  TEXT,
  type           TEXT,
  status         TEXT NOT NULL CHECK (status IN ('found', 'missing', 'error')),
  failure_reason TEXT,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS link_metadata_jobs (
  url         TEXT PRIMARY KEY,
  attempts    INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_link_metadata_jobs_next_run_at ON link_metadata_jobs(next_run_at);

-- URL autotag rules
CREATE TABLE IF NOT EXISTS auto_tag_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auto_tag_rule_tags (
  rule_id  INTEGER NOT NULL REFERENCES auto_tag_rules(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  PRIMARY KEY (rule_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_auto_tag_rule_tags_rule_id ON auto_tag_rule_tags(rule_id);

-- App settings
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
