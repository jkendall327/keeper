import { Suspense, useState } from 'react';
import './App.css';
import { useDB } from './hooks/useDB.ts';
import { QuickAdd } from './components/QuickAdd.tsx';
import { NoteGrid } from './components/NoteGrid.tsx';
import { NoteModal } from './components/NoteModal.tsx';
import type { NoteWithTags } from './db/types.ts';

function AppContent() {
  const { notes, allTags, createNote, updateNote, deleteNote, addTag, removeTag } = useDB();
  const [selectedNote, setSelectedNote] = useState<NoteWithTags | null>(null);

  // Keep selectedNote in sync with latest data from notes array
  const currentNote = selectedNote
    ? notes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  return (
    <>
      <QuickAdd onCreate={createNote} />
      <NoteGrid
        notes={notes}
        onSelect={setSelectedNote}
        onDelete={deleteNote}
      />
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
    </>
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
