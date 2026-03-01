# Keeper

Shamelessly vibecoded replacement for Google Keep.

Made because Keep has too many features I don't care about and no good functionality for exporting data.

Only intended for single-user use, i.e. me. So no promises it will be of any value to anyone else.

## Does it actually work?

To a degree. The basic CRUD flows are all in place for notes.

It doesn't have a properly responsive interface yet, so it's not particularly usable on mobile.

I'm trying to get it working as a PWA for mobile usage but not had any success so far.

There is also a browser extension in this repo for sending content to the app; it works pretty well.

## Development

```bash
npm run dev        # starts both the API server and Vite dev server
npm run dev:vite   # Vite only (frontend)
npm run server     # API server only
```
