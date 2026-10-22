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
date                          local day (YYYY-MM-DD), or null when unknown
verdict                       returnability verdict (below)
note?                          free text
```

A restaurant has zero or more visits, each its own synced record. An omitted date defaults to today; only an explicit `null` records an undated visit. Modeling visits as separate records (not an embedded array) is what lets concurrent visits on two devices both survive last-write-wins reconciliation.

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

A restaurant caches the verdict of its **most recent visit** plus a visit count (`rollupOf` in `src/data/visitOrder.ts`, persisted by `src/data/rollup.ts`). Visits order by `compareVisitsMostRecentFirst`: dated visits first, newest date first, then undated visits, then ties by `updated` descending. The rollup and the visit history both use it, so an undated visit sits at the bottom of the history and counts toward the visit count. The latest verdict is the latest dated visit's, or, with no dated visit, the most recently recorded undated one's; `latestVisitDate` is `null` in that case. It's recomputed locally whenever that restaurant's visits change — including after a sync pull. It is intentionally **not** a sync source of truth and does not bump `updated`; each device derives its own.

## Local storage

IndexedDB (via `idb`, `src/data/db.ts`):

- `restaurants` object store, keyed by `id`
- `visits` object store, keyed by `id`, with a `by-restaurant` index on `restaurantId`
- `meta` object store (v2), out-of-line string keys and values; holds the `owner` key, the id of the account the local store is bound to (`src/data/storeOwner.ts`). Absent means unbound. The v1 to v2 upgrade also writes a `legacy` key, which binding or erasing the store removes: startup binds a legacy store silently. Both keys are device-local and never synced or exported.

The upgrade handler branches on `oldVersion` so future schema versions add stores incrementally.

The v3 upgrade adds no store: it rewrites a visit `date` of `''`, which a client predating undated visits stored, as `null`, then recomputes the rollup of each restaurant it touched, inside the upgrade transaction and without bumping `updated`. Last-write-wins never replaces that `''`, since the remote row carries the same `updated` ([journal entry](../journal/solutions/database-issues/old-client-empty-visit-date-poisons-export.md)).

## Local ↔ PocketBase mapping

The IndexedDB model and the PocketBase schema differ in four places; `src/sync/mappers.ts` translates between them:

| Local (IndexedDB)          | Remote (PocketBase)     | Why                                                                                        |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `updated`                  | `syncedAt`              | PocketBase reserves `updated` as a system autodate field it overwrites on save.            |
| `restaurantId` (on visits) | `restaurant` (relation) | PocketBase models the link as a relation.                                                  |
| —                          | `owner`                 | Set on push to the signed-in user; absent locally (no-account mode has no owner).          |
| `date: null` (on visits)   | `date: ''`              | PocketBase stores an empty text, not `null`; `''` or an absent value reads back as `null`. |

`osm` is a `json` field on both sides; the incoming value is validated by `readOsmSnapshot`, which drops unknown keys.

Verdict strings coming back from PocketBase are runtime-validated against the known set before use, guarding against drift or manual edits. Full backend schema and collection rules are in [pocketbase/README.md](../../pocketbase/README.md).

## Export file

The export file (`src/sync/portability/schema.ts`) is schema v2, where a visit's `date` may be `null`. A v1 file still imports, with a `''` visit `date` or `latestVisitDate` read as `null`; an app still on v1 refuses a v2 file as too new.
