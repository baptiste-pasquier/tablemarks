---
title: Data model
type: reference
audience: [human, agent]
status: stable
stale_after: 2027-04-01
---

# Data model

Two record types — `Restaurant` and `Visit` — defined in `src/types/models.ts`. Both carry the sync fields every synced record needs.

## Sync fields

Every record has:

| Field     | Type         | Purpose                                                                                                                                   |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | string       | Stable, client-generated (15-char `[a-z0-9]`, PocketBase-compatible). Reused as the PocketBase record id so records merge across devices. |
| `updated` | string (ISO) | Bumped on every user-driven change. The last-write-wins key.                                                                              |
| `deleted` | boolean      | Soft-delete tombstone. Deletes set this rather than removing the row.                                                                     |

## Restaurant

```
id, updated, deleted          (sync fields)
name                          required
lat, lng                      number | null  (null while a short link resolves)
address?                      reverse-geocoded from coordinates
mapsUrl?                       the pasted Google Maps link
cuisine?                       a curated key (an OpenStreetMap value: french, bakery…) or free text
note?                          free text (e.g. why you saved a to-try place)
osm?                           read-only OpenStreetMap snapshot (below), replaced whole on refresh
pending                       provisional record awaiting coordinate resolution
latestVerdict, latestVisitDate, visitCount   denormalized rollup (local-derived)
```

**Status is derived, never stored:** zero visits ⇒ _to-try_, one or more ⇒ _visited_ (`statusOf`).

### OSM snapshot

`osm` holds `type` (`node` | `way` | `relation`), `id`, `checkedAt` (ISO instant) and, when OSM has
them, `street`, `postcode`, `city`, `suburb`, `quarter`, `openingHours` (the raw tag), `phone` and
`website`. It is written only by capture, "Complete from OpenStreetMap" and "Refresh", never
edited, and always replaced whole. The short zone ("Paris 11e"), the compact address and the open
state are derived from it at render. It is one PocketBase `json` field; an empty field reads as
absent, a malformed one as absent on sync and as a rejected file on import.

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

| Value             | Label           | Rank |
| ----------------- | --------------- | ---- |
| `go_back`         | Go back         | 4    |
| `worth_a_detour`  | Worth a detour  | 3    |
| `once_was_enough` | Once was enough | 2    |
| `never_again`     | Never again     | 1    |

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

| Local (IndexedDB)          | Remote (PocketBase)     | Why                                                                               |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `updated`                  | `syncedAt`              | PocketBase reserves `updated` as a system autodate field it overwrites on save.   |
| `restaurantId` (on visits) | `restaurant` (relation) | PocketBase models the link as a relation.                                         |
| —                          | `owner`                 | Set on push to the signed-in user; absent locally (no-account mode has no owner). |

`osm` is a `json` field on both sides; the incoming value is validated by `readOsmSnapshot`, which drops unknown keys.

Verdict strings coming back from PocketBase are runtime-validated against the known set before use, guarding against drift or manual edits. Full backend schema and collection rules are in [pocketbase/README.md](../../pocketbase/README.md).
