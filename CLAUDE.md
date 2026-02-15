# Keeper

Read SPEC.md to understand the project and its goals.

## Build & Dev

- `npm run dev` — start dev server (requires COOP/COEP headers, configured in vite.config.ts)
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint
- `npm test` — run all tests (85 data layer + 2 UI integration tests)
- `npm run test:watch` — run tests in watch mode

## Testing & Linting

This project prioritizes **high-value integration and property-based tests** over fastidious unit tests with mocks.

- **Data layer** (`src/db/__tests__/`): 85 tests using real SQLite (better-sqlite3) to verify actual behavior including FTS5, triggers, and foreign key constraints.
- **UI layer** (`src/__tests__/App.test.tsx`): 2 integration tests using React Testing Library with a mock DB, covering modal interactions (close on backdrop click, delete on body clear).

**Always run both tests AND lint before committing**:
- `npm test` — validate functionality
- `npm run lint` — validate code style and catch type errors

Both commands must pass with zero errors before committing. When modifying code, update or add tests as needed.

## React Compiler — `'use no memo'` for non-React files

This project uses the React Compiler (`babel-plugin-react-compiler`) with `compilationMode: 'all'`, which transforms **every** file — not just React components. Any file that runs outside the React runtime (e.g. Web Workers, pure utility modules imported only by workers) must include `'use no memo'` as the first statement. Without it, the compiler injects `useMemoCache` calls that crash at runtime because React isn't available.

When creating new non-React files (workers, shared utilities used by workers), always add `'use no memo'` at the top.

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