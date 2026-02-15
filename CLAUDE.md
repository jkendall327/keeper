# Keeper

Read SPEC.md to understand the project and its goals.

## Build & Dev

- `npm run dev` — start dev server (requires COOP/COEP headers, configured in vite.config.ts)
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint
- `npm test` — run all tests (85 integration + property-based tests)
- `npm run test:watch` — run tests in watch mode

## Testing

This project prioritizes **high-value integration and property-based tests** over fastidious unit tests with mocks. The data layer (`src/db/`) has comprehensive test coverage (85 tests) using real SQLite (better-sqlite3) to verify actual behavior including FTS5, triggers, and foreign key constraints.

**Always run tests before committing** to validate your changes haven't broken existing functionality. When modifying the data layer, update or add tests as needed.

## React Compiler — `'use no memo'` for non-React files

This project uses the React Compiler (`babel-plugin-react-compiler`) with `compilationMode: 'all'`, which transforms **every** file — not just React components. Any file that runs outside the React runtime (e.g. Web Workers, pure utility modules imported only by workers) must include `'use no memo'` as the first statement. Without it, the compiler injects `useMemoCache` calls that crash at runtime because React isn't available.

When creating new non-React files (workers, shared utilities used by workers), always add `'use no memo'` at the top.

## Workflow

- Read the git log briefly to see what work's been done already.
- Always create a git commit when you're done working.
