import { useEffect } from 'react'
import { getDB } from './db/db-client.ts'

function App() {
  useEffect(() => {
    async function smokeTest() {
      const db = getDB()

      const note = await db.createNote({ body: 'Hello https://example.com' })
      console.log('Created note:', note) // has_links should be true

      const all = await db.getAllNotes()
      console.log('All notes:', all) // should contain the note

      const results = await db.search('hello')
      console.log('Search results:', results) // should find it via FTS5

      await db.addTag(note.id, 'test')
      const tagged = await db.getNote(note.id)
      console.log('Tags:', tagged?.tags) // should show [{id: 1, name: 'test'}]

      const untagged = await db.getUntaggedNotes()
      console.log('Untagged:', untagged) // should be empty now
    }

    void smokeTest()
  }, [])

  return <h1>Keeper — check console for smoke test</h1>
}

export default App
