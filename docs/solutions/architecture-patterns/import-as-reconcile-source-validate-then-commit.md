---
title: Import untrusted data as another reconcile source, behind a validate-then-commit boundary
date: 2026-06-13
category: architecture-patterns
module: portability / sync
problem_type: architecture_pattern
component: database
severity: high
related_components:
  - sync-engine
  - frontend
applies_when:
  - Adding a new ingest source (file import, bulk paste, a second backend) to a store that already has a reconcile/last-write-wins merge path
  - Merging untrusted external data into a local-first store keyed by stable client ids
  - Re-ingesting the same data must be idempotent — no duplicates, no clobbering newer local edits, nothing deleted
  - An untrusted uploaded file must be validated before it can touch persistent storage
tags:
  - local-first
  - indexeddb
  - reconcile
  - last-write-wins
  - import
  - validate-then-commit
  - untrusted-input
  - schema-versioning
---

# Import untrusted data as another reconcile source, behind a validate-then-commit boundary

## Context

R6 added a JSON import: a user uploads a previously-exported backup and it merges into the local IndexedDB store — non-destructively, idempotently, and without corrupting the store on a bad file. The store already had a tested reconcile/LWW engine (`reconcile()` in `src/sync/reconcile.ts`) driving cloud sign-in sync via `fullSync`. The temptation is to write a fresh "import merge": loop the file's records, look each up, decide whether to overwrite. That reimplements last-write-wins, tombstone handling, and dedup — the exact logic the sync path already got right, and a second copy will drift.

Two distinct problems had to be solved together: **how to merge** (without duplicating sync logic) and **how to stay safe** (untrusted file → persistent store).

## Guidance

**1. Treat the import as another reconcile source.** `reconcile(local, remote)` unions two record sets by stable id under LWW and returns `{ toWriteLocal, toPush }`. Sync passes the cloud as `remote`; import passes the *parsed file* as `remote` and the store as `local`, then applies `toWriteLocal` through the same raw write helpers and rollup recompute that `fullSync` uses. Upsert-by-stable-id, newer-wins, tombstone propagation, and **re-import-is-a-no-op** (equal `updated` → skipped) all fall out for free. No merge logic is written twice.

**2. Validate-then-commit at the boundary.** Parsing untrusted input and writing the store are separate phases. A pure `parseImport(text)` returns a discriminated result — `{ ok: true, records } | { ok: false, error }` — and touches no store. The caller writes *only* on `ok: true`. Malformed JSON, wrong format, an unknown/future schema version, or a single malformed record all return an error with zero writes, so a bad file can never leave the store half-validated.

**3. Build records field-by-field from an allowlist; coerce, don't trust.** The validator reconstructs each record as a fresh object literal from known fields rather than spreading the parsed object. Junk/extra keys (including `__proto__`) are dropped, and an unknown enum value (e.g. a verdict) is coerced to a safe default instead of rejecting the whole file.

**4. Validate the fields the merge depends on, not just "is a string".** The LWW key (`updated`) is compared as a string, so a non-date value like `"zzz"` that sorts high would win forever and poison future merges — validate it parses to a real date. Reject duplicate ids within a collection: reconcile is keyed by id (a `Map`), so duplicates silently collapse and skew counts unless rejected up front.

## Why This Matters

The reconcile-reuse is what made the feature small: import is a thin driver plus a validator, not a second merge engine, so the LWW invariants are tested once and shared. The validate-then-commit split is what makes it safe: the only code that can corrupt the store is gated behind a pure function that either returns clean records or an error. The field-level validation closes the gap that "shape looks right" leaves open — the merge correctness depends on specific fields (`id` uniqueness, `updated` ordering) that a structural check alone doesn't guarantee.

Skip any of these and the failure is quiet: a parallel merge drifts from sync semantics; an unvalidated write leaves a partial store on a truncated file; a garbage `updated` permanently wins; duplicate ids drop a record with no error.

## When to Apply

- Any new way data enters a store that already reconciles by stable id — file import, bulk paste, a second sync backend. Route it through the existing reconcile rather than a bespoke merge.
- Ingesting untrusted external data into persistent storage: split into a pure validate phase and a commit phase; write only after validation succeeds.
- When the merge orders or keys on a specific field, validate that field's domain (a parseable date, a unique id), not merely its type.

## Examples

**Import drives the same reconcile the sync engine uses (file = remote, store = local):**

```ts
const r = reconcile(await allRestaurantsForSync(), records.restaurants) // file as the "remote" side
for (const rec of r.toWriteLocal) await putRestaurantRaw(rec)           // same raw write path as fullSync
// recompute rollups for affected restaurants, then one emitStoreChange()
```

**Validate-then-commit: the pure boundary the writer trusts.**

```ts
export function parseImport(text: string): ValidationResult {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return { ok: false, error: 'File is not valid JSON.' } }
  return validateEnvelope(parsed) // pure: checks format, schema version, record shapes; touches no store
}
// caller: const res = parseImport(text); if (!res.ok) { show(res.error); return } // store untouched
```

**Validate the merge-critical fields, not just types.**

```ts
// `updated` is the LWW key (compared as a string) — a non-date would win forever.
function isValidTimestamp(x: unknown): x is string { return typeof x === 'string' && !Number.isNaN(Date.parse(x)) }
// reconcile is keyed by id (a Map) — reject duplicates rather than silently collapse them.
if (seenIds.has(rec.id)) return { ok: false, error: 'The file contains duplicate ids.' }
```

## Related

- [`./local-first-lww-sync-indexeddb-pocketbase.md`](./local-first-lww-sync-indexeddb-pocketbase.md) — the reconcile/LWW engine this pattern reuses; that doc covers cross-device sync, this one covers reusing it for a new ingest source.
- [`../conventions/emit-store-change-after-write-commits.md`](../conventions/emit-store-change-after-write-commits.md) — import uses `emitStoreChange` (pull semantics) after the batch commits, not `emitLocalChange`.
- Source: `src/sync/portability/{schema,export,import}.ts`, `src/sync/reconcile.ts`, `src/data/portability.ts`.
