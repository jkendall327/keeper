import { Suspense, useState, useEffect } from 'react';
import './App.css';
import { useDB } from './hooks/useDB.ts';
import { QuickAdd } from './components/QuickAdd.tsx';
import { NoteGrid } from './components/NoteGrid.tsx';
import { NoteModal } from './components/NoteModal.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { Sidebar, type FilterType } from './components/Sidebar.tsx';
import type { NoteWithTags } from './db/types.ts';

function AppContent() {
  const {
    notes,
    allTags,
    createNote,
    updateNote,
    deleteNote,
    addTag,
    removeTag,
    search,
    getUntaggedNotes,
    getNotesForTag,
  } = useDB();

  const [selectedNote, setSelectedNote] = useState<NoteWithTags | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>({ type: 'all' });
  const [displayedNotes, setDisplayedNotes] = useState<NoteWithTags[]>(notes);

  // Update displayed notes based on search query and active filter
  useEffect(() => {
    const loadNotes = async () => {
      if (searchQuery.trim() !== '') {
        // Use FTS5 search
        const results = await search(searchQuery);
        setDisplayedNotes(results);
      } else {
        // Apply filter
        switch (activeFilter.type) {
          case 'all':
            setDisplayedNotes(notes);
            break;
          case 'untagged':
            setDisplayedNotes(await getUntaggedNotes());
            break;
          case 'tag':
            setDisplayedNotes(await getNotesForTag(activeFilter.tagId));
            break;
        }
      }
    };
    void loadNotes();
  }, [searchQuery, activeFilter, notes, search, getUntaggedNotes, getNotesForTag]);

  // Keep selectedNote in sync with latest data from notes array
  const currentNote = selectedNote
    ? notes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  return (
    <div className="app-layout">
      <Sidebar tags={allTags} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      <div className="app-content">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <QuickAdd onCreate={createNote} />
        <NoteGrid
          notes={displayedNotes}
          onSelect={setSelectedNote}
          onDelete={deleteNote}
        />
      </div>
      {currentNote && (
        <NoteModal
          note={currentNote}
          allTags={allTags}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onClose={() => { setSelectedNote(null); }}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Keeper</h1>
      </header>
      <main className="app-main">
        <Suspense fallback={<p className="loading">Loading...</p>}>
          <AppContent />
        </Suspense>
      </main>
    </div>
  );
}

export default App;
