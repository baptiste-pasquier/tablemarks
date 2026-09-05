---
title: Normalize selection-Set keys at the boundary when one Set drives both matching and UI state
date: 2026-06-13
category: design-patterns
module: facets / filtering
problem_type: design_pattern
component: frontend_stimulus
severity: medium
related_components:
  - frontend
applies_when:
  - A Set (or Map) of selected values backs both a membership predicate and UI toggle/active state
  - Values are user-facing strings whose casing or whitespace can vary (free text, datalist)
  - The predicate runs per-item per-render (filtering a list and/or dimming markers)
tags:
  - filtering
  - facets
  - normalization
  - set-membership
  - react
  - case-insensitivity
---

# Normalize selection-Set keys at the boundary when one Set drives both matching and UI state

## Context

The facet filter holds selected values in `Set`s on a `FacetFilter` (`cuisines`, `statuses`, `verdicts`). That same `cuisines` Set is read in two places:

- **Matching** — `matches(restaurant, filter)` decides whether a place is shown in the list and whether its map marker is dimmed.
- **UI state** — `FilterBar` renders a chip per cuisine, marks it active (`has(...)`), and toggles it (`withToggled(...)`).

The first implementation stored **display-form** cuisine strings in the Set (e.g. `'French'`) and made `matches` case-insensitive by scanning: `[...f.cuisines].some(c => c.toLowerCase() === key)`. Two problems followed, flagged in review:

1. **O(M) per call, with allocation.** The `[...set].some(...)` spread allocates an array and scans it for *every restaurant on every filter pass* — and filtering re-runs on every render.
2. **Case desync between matching and UI.** Matching lowercased both sides, but the chip active-check used `filter.cuisines.has(c)` (exact). If the same cuisine existed in two casings across places, the chip could filter correctly yet render as inactive — and the tempting one-line "fix" (make the active-check `has(c.toLowerCase())` without changing what's stored) **breaks the toggle**: `withToggled` would then add `'french'` while `'French'` is still in the Set, producing a duplicate entry that never clears.

## Guidance

**Normalize the key once, at the boundary where values enter the Set, and store only the normalized key.** Keep the display label as a separate, presentation-only concern. Then matching is a direct O(1) lookup and UI state cannot desync, because both sides speak the same key.

Concretely:

- Store **lowercased** cuisine names (plus a stable `UNCATEGORIZED` sentinel) in `FacetFilter.cuisines`.
- `matches` becomes `f.cuisines.has(cuisineKey(r))`, where `cuisineKey` lowercases the place's cuisine (or returns `UNCATEGORIZED`). No spread, no scan.
- `FilterBar` lowercases at the toggle/active boundary (`has(c.toLowerCase())`, `withToggled(..., c.toLowerCase())`) while still rendering the display-form label `c`.
- De-duplicate option lists case-insensitively too (a `Map` keyed by lowercase, value = first-seen display casing), so `french` and `French` collapse to one chip.

The rule generalizes: **a value used as an identity key should be normalized before it enters the keyed structure — not re-normalized at each read site.** Re-normalizing at reads is where matching and UI drift apart.

## Why This Matters

Storing display strings forces every reader to remember to normalize, and the moment one reader forgets (the chip active-check), behavior diverges with no type error to catch it. It also pays an allocation + linear scan on a hot path. Normalizing at the boundary collapses both issues: one lowercasing site, O(1) reads, and matching/UI provably consistent because they share the key. The failure mode of the naive partial fix (normalize the active-check but not the toggle → duplicate, un-clearable Set entries) is the concrete reason "just make the read case-insensitive" is the wrong move.

## When to Apply

- Any time a `Set`/`Map` of selections backs both a predicate and interactive UI (filter chips, multi-select, tag pickers).
- When the selected values are user-facing strings with variable casing/whitespace (free text, `<datalist>` autocomplete).
- When the membership predicate runs per-item per-render — normalization-at-the-boundary also removes the per-call allocation.

## Examples

**Before — display-form storage, case-insensitive scan, desync-prone:**

```ts
// matches(): O(M) scan + array allocation per restaurant
if (f.cuisines.size > 0) {
  const key = cuisineKey(r)
  const hit = [...f.cuisines].some((c) => c === UNCATEGORIZED ? key === UNCATEGORIZED : c.toLowerCase() === key)
  if (!hit) return false
}
// FilterBar: exact has() — desyncs from the lowercased matching above
active={filter.cuisines.has(c)}
onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, c) })}
```

**After — lowercased keys stored at the boundary:**

```ts
// FacetFilter.cuisines stores lowercased names (+ UNCATEGORIZED sentinel)
// matches(): O(1), case-insensitive by construction
if (f.cuisines.size > 0 && !f.cuisines.has(cuisineKey(r))) return false

// FilterBar: lowercase at the toggle/active boundary, render display-form label
active={filter.cuisines.has(c.toLowerCase())}
onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, c.toLowerCase()) })}
```

**Option de-dup keeps one casing per key:**

```ts
const byKey = new Map<string, string>()        // lowercase -> display label
for (const c of CURATED_CUISINES) byKey.set(c.name.toLowerCase(), c.name)
for (const r of restaurants) {
  const c = normalize(r.cuisine)
  if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c)
}
return [...byKey.values()].sort((a, b) => a.localeCompare(b))
```

## Related

- [`../conventions/emit-store-change-after-write-commits.md`](../conventions/emit-store-change-after-write-commits.md) — companion learning from the same feature; covers the store write→notify ordering rather than selection-key normalization.
- Source: `src/features/facets/filter.ts`, `src/features/facets/FilterBar.tsx`, `src/features/facets/cuisines.ts`.
