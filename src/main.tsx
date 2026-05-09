import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createHttpDB } from './db/db-client.ts'
import { KeeperServicesProvider } from './KeeperServicesProvider.tsx'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const apiFetch: typeof fetch = (...args) => globalThis.fetch(...args)
const db = createHttpDB(apiFetch)

createRoot(rootElement).render(
  <StrictMode>
    <KeeperServicesProvider value={{ db, apiFetch }}>
      <App />
    </KeeperServicesProvider>
  </StrictMode>,
)
