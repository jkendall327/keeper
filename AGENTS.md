# Keeper

Read SPEC.md if you need to understand the project and its goals.

## Style

We are using React Compiler, so avoid `useMemo`/`useCallback` if deemed appropriate.

We are moving towards CSS Modules; any new component styling should use modules.

`npm run build` will generate strongly-typed interfaces for the CSS modules in `.d.ts` files.

### Avoiding useEffect antipatterns

The validation mechanism will prevent you from writing stuff like this:

```
  useEffect(() => {
    setSomeState(valueFromProps);
  }, [valueFromProps]);
```

  or:

```
  useEffect(() => {
    if (!enabled) setCount(0);
  }, [enabled]);
```

Don't use effects just to make state match props; reconsider the state strategy.

## Build

`npm run dev` — starts dev server (requires COOP/COEP headers, configured in vite.config.ts)

Run `npm run build`, `npm test` and `npm run lint` to verify your work.

You can assume I'm running the app in the background, so you don't need to start it for me.

## Testing

This project prioritizes high-value integration tests over fastidious unit tests with mocks.

- Data layer (`src/db/__tests__/`): tests using real SQLite (better-sqlite3) to verify actual behavior including FTS5, triggers, foreign key constraints, and mock↔real DB conformance.
- UI layer (`src/__tests__/App.test.tsx`, `IconPicker.test.tsx`): integration tests using React Testing Library with a mock DB, covering modal interactions, search, multi-select, tag management, icon picker, empty states, settings, chat, and more.
- LLM layer (`src/__tests__/tool-executor.test.ts`, `mcp-parser.test.ts`, `llm-client.test.ts`, `streaming.test.ts`): tests covering tool execution, MCP response parsing, LLM client configuration, and streaming.