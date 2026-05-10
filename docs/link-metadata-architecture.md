# Link Metadata Architecture

Keeper stores link preview data as note-linked metadata, not as a special note body adornment. Any URL in a note can produce metadata, and the UI chooses a single preview image from the available candidates.

## Moving Parts

### URL Detection

The shared URL parser lives in `src/db/url-detect.ts`.

- `containsUrl` keeps the note-level `has_links` flag current.
- `extractUrls` finds every HTTP(S) URL in note body text and strips common trailing punctuation.
- The DB layer preserves URL order by writing extracted URLs into `note_links.position`.

### Database Tables

`note_links`

- Stores the relationship between notes and URLs.
- Rows are keyed by `(note_id, url)`.
- `position` records the first-seen URL order within the note.
- Rows cascade away when a note is deleted.

`link_metadata`

- Stores fetched metadata once per URL.
- Includes preview image fields, image alt/size, title, site name, canonical URL, Open Graph type, fetch status, failure reason, and timestamps.
- Status is one of `found`, `missing`, or `error`.

`link_metadata_jobs`

- Stores durable background fetch work.
- Dedupe happens by URL, so multiple notes sharing a URL do not cause duplicate fetches.
- `attempts`, `next_run_at`, and `last_error` support retry backoff.

The old `link_previews` table is no longer authoritative. Migration opportunistically copies old rows into `link_metadata`.

### Note Hydration

`NoteWithTags` exposes:

```ts
link_metadata: LinkMetadata[];
```

The DB layer keeps `note_links` synchronized on note create/update, then hydrates notes by joining `note_links` to `link_metadata` ordered by `note_links.position`. Batch note queries hydrate metadata in one grouped query, so note lists and smart views get the same behavior as single-note reads.

### Metadata Fetching

The server parser/fetcher lives in `server/link-preview.ts`.

It preserves the existing safety checks:

- HTTP(S)-only URLs.
- private IP and private network rejection.
- fetch timeout.
- redirect following through `fetch`.
- maximum HTML response size.
- `text/html` content-type check.

It uses Cheerio to extract:

- `og:image`, `og:image:secure_url`, `og:image:alt`, `og:image:width`, `og:image:height`
- `og:title`, `og:site_name`, `og:url`, `og:type`
- `twitter:image`, `twitter:image:src`, `twitter:title`
- fallback page `<title>`

Relative image and canonical URLs are resolved against the final response URL.

### Background Queue

The queue lives in `server/link-preview-queue.ts`.

On note create/update, routes enqueue all URLs from the note body. On server startup, the queue scans existing note links and enqueues URLs that are missing, errored, missing-image, or stale.

Processing flow:

1. Check `linkPreviewFetchEnabled`.
2. Claim the next due job from `link_metadata_jobs`.
3. Fetch and parse metadata.
4. On `found` or `missing`, write `link_metadata` and delete the job.
5. On `error`, write an error metadata row and reschedule the job with backoff.
6. Broadcast `refresh` only when a useful image is newly found or changed.

The queue is intentionally in-process and SQLite-backed. This keeps the system simple while making work persistent across server restarts.

### API

The primary read endpoint is:

```txt
GET /api/link-metadata?url=...
```

There is no public manual enqueue endpoint for v1. URL enqueueing is an internal consequence of note create/update and startup scanning.

Legacy preview routes/method names are kept as compatibility shims where useful, but new code should use the metadata terminology.

## Preview Selection

The shared UI selection helper is `src/components/link-preview-selection.ts`.

Display priority:

1. Direct image URL in the note body.
2. First `found` metadata image in note URL order.
3. No preview image.

The direct image case wins because users who save a bare image URL are usually making an image note, not asking Keeper to infer a page preview.

For metadata previews, Keeper chooses the first usable image in note URL order. This matches reading order and avoids surprising jumps when a later URL has richer metadata than an earlier URL.

Alt text priority:

1. Direct image notes: note title, then `Image note`.
2. Metadata images: `og:image:alt`, metadata title, note title, then `Link preview image`.

The UI stores title/site/canonical/type metadata for future richer cards, but it currently renders only the image.

## Settings

The existing setting names remain:

- `linkPreviewFetchEnabled`
- `linkPreviewDisplayEnabled`

Fetch disabled means the queue does not process jobs. Display disabled means cached metadata remains stored but preview images are not rendered.

## Design Decisions

- Parse all URLs, not only URL-only notes. Link previews are metadata about note content, so embedded links should be eligible.
- Store note-to-link associations separately from metadata. This avoids duplicating metadata per note and lets URL order remain note-specific.
- Keep one rendered image per note for v1. This keeps note cards compact and avoids designing a gallery/card layout before it is needed.
- Dedupe fetches by URL. The same URL can appear in many notes, but it should have one metadata row and one queue job.
- Retry failures silently. Link previews are enhancement data; failures should not create visible note errors.
- Broadcast only for newly useful image metadata. Missing/error writes should not cause unnecessary UI refreshes.
- Keep legacy settings and shims. This reduces migration and client compatibility risk while allowing new code to use `LinkMetadata`.
