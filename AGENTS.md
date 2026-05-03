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
- Always create a git commit when you're done working. You have a skill for creating commits that you should use.


## ClaudeCatcher

This project uses ClaudeCatcher to enforce code quality. You MUST run it after writing or modifying code.

```bash
./claudecatcher <paths> --severity warning
./claudecatcher --help  # Full option and rule reference
```

**Fix all reported errors and warnings before committing.** Do not dismiss, skip, or ignore findings. If a finding seems incorrect, investigate it — do not assume it is a false positive.

### What ClaudeCatcher expects from tests

**Avoid empty/null assertions without positive evidence.** ClaudeCatcher flags `toBeNull()`, `toHaveLength(0)`, and `toEqual([])` when they appear without proof that real data existed. Strategies:
- For functions returning `T | null`: use `toBe(null)` (not `toBeNull()`) and pair it with a `toBe(someValue)` assertion on a valid input within the same test — put the positive assertion first.
- For "no-op" / "doesn't affect" tests: assert data IS present before the operation, then re-fetch and assert after. Use `let` variables so you can reassign and assert the same logical object before and after.
- For emptiness after a deletion: assert the expected data existed beforehand (on the same variable), then assert empty after.

**Assert element contents, not just collection shape.** `toHaveLength(n)` or `toContain(x)` alone triggers SHAPE_ONLY_COLLECTION. Follow with an element-level assertion: `expect(arr[0]?.name).toBe('expected')`.

**Avoid nullish fallbacks (`?? []`).** These mask undefined values and trigger NULLISH_FALLBACK. Use optional chaining directly in the assertion instead: `expect(foo?.bar[0]?.name).toBe('x')`.

**No-op tests need a positive case.** When testing that a function does nothing (e.g. empty id list), also call it with valid inputs in the same test and assert it works — this proves the no-op path is meaningful, not just that nothing ever happened.
