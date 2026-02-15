# Keeper

Read SPEC.md to understand the project and its goals.

## Build & Dev

- `npm run dev` — start dev server (requires COOP/COEP headers, configured in vite.config.ts)
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint

## React Compiler — `'use no memo'` for non-React files

This project uses the React Compiler (`babel-plugin-react-compiler`) with `compilationMode: 'all'`, which transforms **every** file — not just React components. Any file that runs outside the React runtime (e.g. Web Workers, pure utility modules imported only by workers) must include `'use no memo'` as the first statement. Without it, the compiler injects `useMemoCache` calls that crash at runtime because React isn't available.

Files that currently need this: `src/db/db.worker.ts`, `src/db/schema.ts`, `src/db/url-detect.ts`.

When creating new non-React files (workers, shared utilities used by workers), always add `'use no memo'` at the top.

## Workflow

- Always create a git commit when you're done working.
