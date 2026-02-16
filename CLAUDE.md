# Keeper

Read SPEC.md to understand the project and its goals.

## Build & Dev

- `npm run dev` — start dev server (requires COOP/COEP headers, configured in vite.config.ts)
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint
- `npm test` — run all tests
- `npm run test:watch` — run tests in watch mode

## Testing & Linting

This project prioritizes **high-value integration and property-based tests** over fastidious unit tests with mocks.

- **Data layer** (`src/db/__tests__/`): 143 tests using real SQLite (better-sqlite3) to verify actual behavior including FTS5, triggers, foreign key constraints, and mock↔real DB conformance.
- **UI layer** (`src/__tests__/App.test.tsx`, `IconPicker.test.tsx`): 39 integration tests using React Testing Library with a mock DB, covering modal interactions, search, multi-select, tag management, icon picker, empty states, settings, chat, and more.
- **LLM layer** (`src/__tests__/tool-executor.test.ts`, `mcp-parser.test.ts`, `llm-client.test.ts`, `streaming.test.ts`): 40 tests covering tool execution, MCP response parsing, LLM client configuration, and streaming.

**Always run both tests AND lint before committing**:
- `npm test` — validate functionality
- `npm run lint` — validate code style and catch type errors

Both commands must pass with zero errors before committing. When modifying code, update or add tests as needed.

## Workflow

- Read the git log briefly to see what work's been done already.
- Always create a git commit when you're done working.


## ClaudeCatcher

This project uses ClaudeCatcher to enforce code quality. You MUST run it after writing or modifying code.

```bash
./claudecatcher <paths> --severity warning
./claudecatcher --help  # Full option and rule reference
```

**Fix all reported errors and warnings before committing.** Do not dismiss, skip, or ignore findings. If a finding seems incorrect, investigate it — do not assume it is a false positive.
