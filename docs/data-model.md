# Data model

Two record types — `Restaurant` and `Visit` — defined in `src/types/models.ts`. Both carry the sync fields every synced record needs.

## Sync fields

Every record has:

| Field | Type | Purpose |
|---|---|---|
| `id` | string | Stable, client-generated (15-char `[a-z0-9]`, PocketBase-compatible). Reused as the PocketBase record id so records merge across devices. |
| `updated` | string (ISO) | Bumped on every user-driven change. The last-write-wins key. |
| `deleted` | boolean | Soft-delete tombstone. Deletes set this rather than removing the row. |

## Restaurant

```
id, updated, deleted          (sync fields)
name                          required
lat, lng                      number | null  (null while a short link resolves)
address?                      reverse-geocoded from coordinates
mapsUrl?                       the pasted Google Maps link
cuisine?                       stored when given; filtering is a later layer
note?                          free text (e.g. why you saved a to-try place)
pending                       provisional record awaiting coordinate resolution
latestVerdict, latestVisitDate, visitCount   denormalized rollup (local-derived)
```

**Status is derived, never stored:** zero visits ⇒ *to-try*, one or more ⇒ *visited* (`statusOf`).

## Visit

```
id, updated, deleted          (sync fields)
restaurantId                  links to its Restaurant
date                          ISO date (YYYY-MM-DD)
verdict                       returnability verdict (below)
note?                          free text
```

A restaurant has zero or more visits, each its own synced record. Modeling visits as separate records (not an embedded array) is what lets concurrent visits on two devices both survive last-write-wins reconciliation.

## Verdict

The rating is a four-level **returnability verdict** — no numeric score:

| Value | Label | Rank |
|---|---|---|
| `go_back` | Go back | 4 |
| `worth_a_detour` | Worth a detour | 3 |
| `once_was_enough` | Once was enough | 2 |
| `never_again` | Never again | 1 |

`VERDICT_RANK` orders them for future sort/filter.

## Rollup

A restaurant caches the verdict of its **most recent visit** plus a visit count (`src/data/rollup.ts`). It's recomputed locally whenever that restaurant's visits change — including after a sync pull. It is intentionally **not** a sync source of truth and does not bump `updated`; each device derives its own.

## Local storage

IndexedDB (via `idb`, `src/data/db.ts`):

- `restaurants` object store, keyed by `id`
- `visits` object store, keyed by `id`, with a `by-restaurant` index on `restaurantId`

The upgrade handler branches on `oldVersion` so future schema versions add stores incrementally.

## Local ↔ PocketBase mapping

The IndexedDB model and the PocketBase schema differ in three places; `src/sync/mappers.ts` translates between them:

| Local (IndexedDB) | Remote (PocketBase) | Why |
|---|---|---|
| `updated` | `syncedAt` | PocketBase reserves `updated` as a system autodate field it overwrites on save. |
| `restaurantId` (on visits) | `restaurant` (relation) | PocketBase models the link as a relation. |
| — | `owner` | Set on push to the signed-in user; absent locally (no-account mode has no owner). |

Verdict strings coming back from PocketBase are runtime-validated against the known set before use, guarding against drift or manual edits. Full backend schema and collection rules are in [pocketbase/README.md](../pocketbase/README.md).
