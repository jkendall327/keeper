import { Suspense } from 'react';
import './App.css';
import { useDB } from './hooks/useDB.ts';
import { QuickAdd } from './components/QuickAdd.tsx';
import { NoteGrid } from './components/NoteGrid.tsx';

function AppContent() {
  const { notes, createNote, updateNote, deleteNote } = useDB();

  return (
    <>
      <QuickAdd onCreate={createNote} />
      <NoteGrid
        notes={notes}
        onUpdate={updateNote}
        onDelete={deleteNote}
      />
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
