I'm thinking about coding up a small replacement for google keep intended for personal use only (single user app). This is because I like the simplicity of google keep and the zero friction to adding new notes, but dislike how annoying google makes it to get stuff out of there afterwards. I want basically a dumping group for little snippets of text, links or whatever which I can then go through later, sort, filter, tag, and eventually move into a more long-term storage solution elsewhere. So my replacement needs to be:
- very low friction for adding a note
- have the ability to add tags
- good export capabilities
- ability to store images
- notes have a title and a body

Other things I would like:
- ability to do checkboxes for simple task lists
- ability to find all untagged notes
- full-text search on note content
- good performance for loading lots of notes (500+)
- ability to just do markdown rendering in notes with a toggle, no other formatting stuff required or wanted

Things I explicitly don't care about:
- auth (single user app, for now)
- audio notes
- drawing features
- version history for notes

---

## 1. Functional Requirements (The Core Spec)

### Data Entry & Management

* **Zero-Click Entry:** The app should open with an empty "Quick Add" field focused by default. Losing focus on the note field saves the note instantly.
* **Note Structure:**
* `Title`: Optional. If left blank, use the first 50 characters of the body or a timestamp.
* `Body`: Plain text (stored as Markdown).
* `Tags`: An array of strings. Support `#tag` auto-detection in the body.
* `Images`: Support for pasting images (Clipboard API).
* **Checkboxes:** Render `[ ]` and `[x]` as interactive checkboxes in the preview/markdown mode.

### Organization & Discovery

* **Untagged Filter:** A dedicated view or a "smart folder" that queries for notes where the `tags` array is empty.
* Sidebar view of all tags so I can click onto them to instantly search for notes with that tag.
* **Full-Text Search:** Global search bar that queries both Title and Body.
* **Markdown Toggle:** A "Read/Write" switch. Write mode shows raw text; Read mode renders HTML.

---

react frontend for the ui
mardkwon-it or remark for markdown rendering - don't care which

---

## 3. Data Schema (SQLite Example)

Using a relational approach ensures you can find "untagged" notes easily.

```sql
-- Main Notes Table
CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Virtual Table for Full-Text Search
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');

-- Tags Table (Many-to-Many)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
);

CREATE TABLE note_tags (
    note_id INTEGER,
    tag_id INTEGER,
    FOREIGN KEY(note_id) REFERENCES notes(id),
    FOREIGN KEY(tag_id) REFERENCES tags(id)
);

```

---

### 1. Persistence & Storage Architecture

The app will run entirely in the browser, using the **Origin Private File System (OPFS)** as the virtual hard drive.

* **Database Engine:** `sqlite-wasm` running in a **Web Worker**. This prevents UI "jank" when performing full-text searches.
* **Text Storage:** SQLite (FTS5 enabled) stores note metadata, body text, and tags.
* **Image Storage:** Images are stored as raw files in a `/media` folder within OPFS.
* **Linking:** The `notes` table contains a `media_id` or a Markdown reference (e.g., `![image](opfs://media/uuid.png)`).
* **Durability:** On first boot, the app calls `navigator.storage.persist()` to request that the browser does not "auto-clean" the data.

---

### 2. High-Speed Workflow (Low Friction)

* **The "Inbox" Mentality:** The default view is a chronological stream.
* **Quick-Capture:** A persistent input bar at the top.
* `#tag` inside the text is automatically parsed and added to the `tags` table on note save.

* **Untagged View:** A "Smart Folder" that executes:
`SELECT * FROM notes WHERE id NOT IN (SELECT note_id FROM note_tags);`

---

### 3. The "Concatenator" Export Engine

This is your "Get Stuff Out" solution. Instead of a generic dump, the app provides a **Selection & Transform** workflow.

| Feature | Logic |
| --- | --- |
| **Multi-Select** | Shift-click or "Select All Untagged" to highlight notes. |
| **Smart Concatenation** | A "Copy to Clipboard" or "Export to .txt" action that joins selected notes with a user-defined separator (default: `\n\n`). |
| **Link Extractor** | A specific export mode that regex-parses all URLs from selected notes and produces a clean, bulleted list of links. |
| **The "Burn" Feature** | An optional toggle during export: **"Delete notes after successful export."** This maintains the "Dumping Ground" workflow—keep the inbox empty. |

---

### 4. Data Schema Update

To support the "Links vs Text" and "Media" requirements:

```sql
-- Enhanced Notes Table
CREATE TABLE notes (
    id TEXT PRIMARY KEY, -- UUID
    title TEXT,
    body TEXT,           -- Markdown content
    has_links BOOLEAN,   -- Indexed for quick "Link" filtering
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Media Reference Table
CREATE TABLE media (
    id TEXT PRIMARY KEY,
    opfs_path TEXT,      -- Path to file in OPFS
    mime_type TEXT,
    note_id TEXT,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

```

---

### 5. UI/UX

* **Search-First Interface:** Global search (`/` key) filters the list in real-time using SQLite's `MATCH` syntax.
* **Markdown Toggle:** A "Preview" floating button that renders Markdown (including checkboxes) instantly.

