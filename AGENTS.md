# Keeper

Read SPEC.md if you need to understand the project and its goals.

## Build

`npm run dev` — starts dev server (requires COOP/COEP headers, configured in vite.config.ts)

Run `npm test` and `npm run lint` to verify your work.

## Testing

This project prioritizes **high-value integration and property-based tests** over fastidious unit tests with mocks.

- **Data layer** (`src/db/__tests__/`): tests using real SQLite (better-sqlite3) to verify actual behavior including FTS5, triggers, foreign key constraints, and mock↔real DB conformance.
- **UI layer** (`src/__tests__/App.test.tsx`, `IconPicker.test.tsx`): integration tests using React Testing Library with a mock DB, covering modal interactions, search, multi-select, tag management, icon picker, empty states, settings, chat, and more.
- **LLM layer** (`src/__tests__/tool-executor.test.ts`, `mcp-parser.test.ts`, `llm-client.test.ts`, `streaming.test.ts`): tests covering tool execution, MCP response parsing, LLM client configuration, and streaming.