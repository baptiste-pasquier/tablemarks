# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Relationships

A Restaurant owns zero or more Visits. A Restaurant's Status and its Rollup are _derived_ from its Visits, never stored independently. Every Restaurant and Visit is an independently synced record under Last-Write-Wins.

## Records

### Restaurant

A saved place — a favorite or one to try — with a location, optional cuisine and note, and the source Google Maps link. A Restaurant is the parent record; its Status and Rollup are derived from its Visits, so it is never directly marked "visited."

### Visit

A single timestamped record of going to a Restaurant, carrying a date (a Local day) and a Verdict. Visits are separate records (not embedded in the Restaurant), so two devices can each add a visit without one overwriting the other under Last-Write-Wins.

### Provisional record

A Restaurant saved from a short Google Maps link whose coordinates could not be resolved yet (offline, or a transient failure). It has no map pin until a later resolve pass fills its coordinates and clears the provisional flag.

## Rating and status

### Verdict

The entire rating of a Visit, expressed as returnability rather than a number: _Go back_, _Worth a detour_, _Once was enough_, _Never again_. There is no numeric score.

### Status

Whether a Restaurant is _to-try_ or _visited_ — derived from its visit count (zero visits is to-try, one or more is visited). Never stored as a field.

### Standing

The single derived classification that fuses a Restaurant's Status with its latest Verdict. It is _to-try_ when there are no Visits; otherwise, it is the latest Visit's Verdict. It is never stored and does not replace either Status or Verdict as a domain concept.

### Rollup

The denormalized summary cached on a Restaurant — the most recent Visit's Verdict and the visit count — recomputed locally from its Visits. It is a per-device derived cache, not a synced source of truth, and recomputing it does not mark the Restaurant as changed.

## Classification

### Facet

An orthogonal dimension a Restaurant can be filtered by. The facets are Cuisine, Status, and Verdict; filters combine as AND across facets and OR within one facet.

### Cuisine

A Restaurant's single optional category, labelled "Category" in the interface: a cuisine
(French, Indian) or a kind of place (bakery, bar). A curated category is stored as its
OpenStreetMap key and shown in the reader's language; a free-typed one is stored as typed. Each
category maps to one color, shared by its map marker and its filter chip, and curated categories
of one family share a hue; a Restaurant with no category is "uncategorized."

## Time

### Instant

A moment in time recorded as a UTC timestamp — canonical and timezone-independent. Every change-timestamp used for Last-Write-Wins ordering is an Instant.

### Local day

A calendar day with no time-of-day, interpreted relative to the viewer's device timezone rather than UTC — used for user-facing dates such as a Visit's date. An Instant and a Local day are not directly comparable: converting one to the other's frame first is required, or the comparison is wrong for a viewer outside UTC.

## Sync

### Local-first canonical store

The principle that the on-device store is the source of truth and always written first; the cloud is an optional mirror enabled by signing in. The app is fully usable with no account and no network.

### Local-only deployment

A deployment configured with no backend at all, so sign-in, sync, and short-link resolution are absent by design rather than temporarily failing. Distinct from a deployment whose backend is configured but not answering, where those capabilities exist and are interrupted.

### Last-Write-Wins (LWW)

The conflict-resolution rule: when the same record exists on two sides, the version with the newer change-timestamp (an Instant) wins, both directions, with ties keeping the local copy. Reconciliation is keyed on a stable client-generated id shared between local and cloud, so signing in merges rather than duplicates.

### Tombstone

A soft-delete marker — a record flagged deleted with a fresh timestamp rather than removed. Tombstones participate in Last-Write-Wins like any record, so a delete propagates across devices and a stale copy cannot resurrect it.

### Export

A user-triggered write of the entire collection — every Restaurant and Visit, including Tombstones and their sync timestamps — to a single versioned JSON file for personal backup and portability. It is full-fidelity and round-trippable, not an interchange format for other apps.

### Import

Merging a previously exported file back into the store as another Last-Write-Wins reconcile source: records upsert by stable id, the newer wins, unseen records are added, and nothing is deleted — so re-importing an unchanged file is a no-op. A malformed or unrecognized file is rejected without touching the store.

### Sync Status

The single global backup-trust state shown when signed in: _all synced_, _N pending_, _offline_, or _problem_ (a repeated non-offline push failure, naming the likely cause). Distinct from a Restaurant's own `pending` field (an unresolved provisional record) — Sync Status is record-agnostic and never shown per-record.

## Flagged ambiguities

- "Rating" refers to the Verdict (a returnability judgment), not a numeric score — Tablemarks has no star rating.
- "Local" spans three unrelated states: a Local-only deployment (no backend configured), _offline_ (the device has no network, a Sync Status value), and signed out (an account state). A signed-out user on a fully-backed deployment is none of the other two.
