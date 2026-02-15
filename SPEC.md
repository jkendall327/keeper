# Google Keep Clone - Clean Specification

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
- `title` (optional): Auto-generated from first 50 chars of body or timestamp if left blank
- `body` (required): Plain text stored as Markdown
- `tags`: Array of tag associations
- `created_at`, `updated_at`: Timestamps

**Image Support:**
- Paste from clipboard (Clipboard API)
- Store as files in OPFS `/media` folder
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

**Library:**
- Use `markdown-it` or `remark` (either is acceptable)

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
    title TEXT,                       -- Optional, auto-gen if blank
    body TEXT,                        -- Markdown content
    has_links BOOLEAN DEFAULT 0,      -- Indexed for "Links" view
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    body,
    content='notes',
    content_rowid='id'
);

-- Tags (many-to-many)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
);

CREATE TABLE note_tags (
    note_id TEXT,
    tag_id INTEGER,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Media/Images
CREATE TABLE media (
    id TEXT PRIMARY KEY,              -- UUID
    opfs_path TEXT,                   -- Path in OPFS filesystem
    mime_type TEXT,                   -- e.g., image/png
    note_id TEXT,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);
```

### Key Indexes
- `notes.has_links` for fast "Links" view filtering
- FTS5 virtual table on title/body for full-text search
- Foreign keys with CASCADE for clean deletion

### Untagged Query
```sql
SELECT * FROM notes
WHERE id NOT IN (SELECT note_id FROM note_tags);
```

---

## 4. Technical Architecture

### Frontend
- **Framework**: React (already configured)
- **Markdown**: `markdown-it` or `remark`
- **UI Philosophy**: Search-first, low-friction interface

### Storage Layer

**SQLite + Web Worker:**
- `sqlite-wasm` running in a Web Worker (prevents UI jank during FTS queries)
- Origin Private File System (OPFS) as virtual filesystem
- Images stored as files in OPFS `/media` folder

**Persistence:**
- Call `navigator.storage.persist()` on first boot
- Prevents browser auto-cleanup of OPFS data

### Data Flow

**Main Thread ↔ Worker Communication:**
- Post messages for all DB queries
- Worker handles SQLite operations
- Results sent back to main thread

**Image Paste Workflow:**
1. Clipboard paste event
2. Convert to Blob
3. Write to OPFS `/media/[uuid].[ext]`
4. Store reference in `media` table with `note_id`

**Search:**
- FTS5 queries for full-text search
- SQL queries for smart views (untagged, links)

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

### Markdown Preview
1. User clicks "Preview" toggle button
2. Raw markdown → rendered HTML
3. Checkboxes become interactive
4. Click again to return to edit mode

---

## 6. Out of Scope (MVP)

The following features are explicitly deferred or not wanted:

**Deferred to Future:**
- Link extractor export mode (regex-parse URLs into bulleted list)
- Advanced export formats (JSON, per-note markdown files)
- Auto-detection of #tags from body text (may add later; separate tag UI is primary)

**Explicitly Not Wanted:**
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
- Image paste: < 200ms to write to OPFS

### Browser Compatibility
The user only uses Vivaldi so that's the priority. But we should be able to support Chromium browsers and Firefox.
I don't care about Safari or any other browser.

### Development Approach
1. Set up SQLite in Web Worker with OPFS
2. Build basic CRUD operations for notes
3. Implement tag system
4. Add FTS5 search
5. Build export functionality
6. Add image paste/storage
7. Implement markdown preview with checkbox interactivity
