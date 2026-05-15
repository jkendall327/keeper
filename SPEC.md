# Keeper

## 1. Overview & Goals

### Problem Statement
Google Keep provides excellent low-friction note capture, but makes it difficult to export notes for long-term storage elsewhere. This app aims to be a better "dumping ground" for quick snippets, links, and ideas.

### Core Philosophy
**"Zero friction in, easy out"**

- Notes should be captured instantly with minimal UI interaction
- Inbox-first mentality: chronological stream of captured thoughts
- Export workflow is first-class, not an afterthought
- Single-user browser app (no authentication needed)

### What This App Is
A temporary holding area for:
- Text snippets and thoughts
- URLs and links
- Quick task lists (checkboxes)
- Images (screenshots, clipboard pastes)
- Ideas that will eventually move to long-term storage

---

## 2. MVP Feature Set

### 2.1 Note Creation & Structure

**Zero-Click Entry:**
- App opens with "Quick Add" field auto-focused
- Auto-save on blur (lose focus = instant save)
- No "Create Note" button needed

**Note Fields:**
- `title` (optional)
- `body` (required): Plain text stored as Markdown
- `tags`: Array of tag associations
- `created_at`, `updated_at`: Timestamps

**Image Support:**
- Paste from clipboard (Clipboard API)
- Store files under the server data directory's `media/` folder
- Reference via `media` table linked to notes

### 2.2 Organization & Discovery

**Default View:**
- Chronological stream (inbox mentality)
- Most recent notes first

**Sidebar:**
- Clickable list of all tags
- Click tag → filter to notes with that tag

**Smart Views:**
- **"Untagged" view**: Shows notes with no tags
  - SQL: `SELECT * FROM notes WHERE id NOT IN (SELECT note_id FROM note_tags);`
- **"Links" view**: Shows notes containing URLs
  - Uses `has_links` boolean flag for fast filtering

**Full-Text Search:**
- Global search bar (⌘/Ctrl+/ keyboard shortcut)
- Searches both title and body fields
- Uses SQLite FTS5 for performance

### 2.3 Tag Management

**Separate Tag Editor UI:**
- Click on note → Tag editor appears
- Add tags via dedicated UI (not just auto-detection)
- Remove tags from notes
- Rename tags across all notes

**Visual Display:**
- Tag chips/badges on note cards
- Sidebar shows all tags used in system

### 2.4 Markdown Rendering

**Storage Format:**
- Body field stores plain text Markdown

**Toggle Modes:**
- **Edit mode**: Raw text editor
- **Preview mode**: Rendered HTML

**Interactive Checkboxes:**
- `[ ]` renders as unchecked checkbox (clickable)
- `[x]` renders as checked checkbox (clickable)
- Clicking checkbox updates underlying Markdown

### 2.5 Export System

**Multi-Select:**
- Shift-click to select multiple notes
  - This is either clicking on notes individually or dragging the mouse to select a range.
- "Select All Untagged" button for bulk selection

**Export Options:**
- **Copy to clipboard**: Concatenate notes with `\n\n` separator
- **Save as .txt file**: Download concatenated text
- Expect this feature to be expanded later, develop it with expansion in mind.

**"Burn After Export" Feature:**
- Optional toggle during export
- Deletes selected notes ONLY after successful export
- Maintains "inbox zero" workflow

---

## 3. Data Model

### Schema

```sql
-- Notes table
CREATE TABLE notes (
    id TEXT PRIMARY KEY,              -- UUID
    title TEXT NOT NULL DEFAULT '',   -- Optional, auto-gen if blank
    body TEXT NOT NULL DEFAULT '',    -- Markdown content
    has_links INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    trashed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    body,
    content='notes',
    content_rowid='rowid'
);

-- Tags (many-to-many)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT NULL
);

CREATE TABLE note_tags (
    note_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Media/Images
CREATE TABLE media (
    id TEXT PRIMARY KEY,              -- UUID
    note_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,          -- e.g., image/png
    filename TEXT NOT NULL,           -- File in DATA_DIR/media
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);
```

### Key Indexes
- `notes.has_links`, `notes.pinned`, `notes.archived`, and `notes.trashed` for fast view filtering
- FTS5 virtual table on title/body for full-text search
- `media.note_id` for listing note attachments
- Foreign keys with CASCADE for clean deletion

### Related Tables
- `note_links` records extracted URLs and their position in a note
- `link_metadata` caches fetched preview data for links
- `link_metadata_jobs` tracks background preview fetch attempts
- `auto_tag_rules` and `auto_tag_rule_tags` store URL autotagging rules
- `app_settings` stores user-visible app settings

### Untagged Query
```sql
SELECT * FROM notes
WHERE id NOT IN (SELECT note_id FROM note_tags);
```

---

## 4. Technical Architecture

### Frontend
- **Framework**: React with TanStack Router and TanStack Query
- **Markdown**: Markdown rendering with sanitized preview output
- **UI Philosophy**: Search-first, low-friction interface

### Server/API Layer
- **Server**: Fastify
- **Database**: `better-sqlite3`
- **Media**: Filesystem-backed files under `DATA_DIR/media`
- **Backup/Restore**: Keeper archive containing a SQLite snapshot plus media files

### Storage Layer

**SQLite + Filesystem:**
- SQLite lives in the configured server data directory
- Images and other uploaded media are stored as files in `DATA_DIR/media`
- Media records in SQLite link files to notes and enable cleanup/backup

### Data Flow

**Client ↔ Fastify API:**
- The React app talks to `/api/*` endpoints through the typed client
- Fastify routes call the `KeeperDB` interface
- Server-sent events notify the app when background work or extension capture should refresh client state

**Image Paste Workflow:**
1. Clipboard paste event
2. Convert to Blob
3. Upload to `/api/media`
4. Server writes `DATA_DIR/media/[uuid].[ext]`
5. Server stores reference in `media` table with `note_id`
6. Markdown references the attachment as `media://[uuid]`, rendered through `/api/media/[uuid]`

**Search:**
- FTS5 queries for full-text search
- SQL queries for smart views (untagged, links)

**Link Previews:**
- Note bodies are scanned for URLs after create/update
- Background jobs fetch preview metadata when link preview fetching is enabled
- Preview display can be independently disabled in settings

---

## 5. Key Workflows

### Quick Capture
1. User opens app → Quick Add field is auto-focused
2. User types note content
3. User clicks away → Note created instantly
4. Note appears at top of chronological stream
5. Mosaic/masonry layout for note display, not a single column layout

### Tagging
1. User clicks on note → Tag editor appears to the side next to text-edit area
2. User adds/removes tags via UI
3. Tags saved to `note_tags` junction table
4. Sidebar tag list updates automatically

### Full-Text Search
1. User presses ⌘/Ctrl+/ (or clicks search bar)
2. Type query
3. SQLite FTS5 searches title + body
4. Results filter in real-time

### Export & Burn
1. User shift-clicks to select notes (or uses "Select All Untagged")
2. User clicks "Export" button
3. Modal shows options:
   - Copy to clipboard OR save as .txt
   - "Delete after export" checkbox
4. If burn enabled: Notes deleted ONLY after successful export confirmation

### Backup & Restore
1. User opens settings
2. User downloads a Keeper archive containing a SQLite snapshot and, optionally, media files
3. User can restore an archive, replacing the current database and media directory after a pre-restore backup is created

### Markdown Preview
1. User clicks "Preview" toggle button
2. Raw markdown → rendered HTML
3. Checkboxes become interactive
4. Click again to return to edit mode

---

## 6. Out of Scope (MVP)

The following features are explicitly deferred or not wanted:

- Multi-user support / authentication
- Audio notes
- Drawing features
- Version history for notes
- Rich text editor (Markdown-only is intentional)

---

## 7. Success Criteria

The MVP is complete when:

1. ✅ User can open app and immediately start typing a note
2. ✅ Notes save automatically on blur
3. ✅ Full-text search works on 500+ notes without lag
4. ✅ Images can be pasted from clipboard and display in notes
5. ✅ User can tag notes and filter by tag
6. ✅ "Untagged" view shows notes missing tags
7. ✅ "Links" view shows notes containing URLs
8. ✅ Markdown preview works with interactive checkboxes
9. ✅ User can multi-select notes and export to clipboard/.txt
10. ✅ "Burn after export" feature successfully deletes exported notes

---

## 8. Implementation Notes

### Performance Targets
- Search latency: < 100ms for FTS queries on 1000 notes
- Note save: < 50ms (perception of instant save)
- Image paste: < 200ms to upload and store media locally on normal home-network/dev-machine conditions

### Browser Compatibility
The user only uses Vivaldi so that's the priority.
But we should be able to support Chromium browsers and Firefox.
I don't care about Safari or any other browser.
