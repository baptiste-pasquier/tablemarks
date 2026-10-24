---
title: Keep OSM data for every venue picked, not only eateries — the eatery list is for display
date: 2026-10-24
category: design-patterns
module: capture / osmTags
problem_type: logic_error
component: frontend_stimulus
severity: medium
related_components:
  - frontend
applies_when:
  - Deciding whether a picked or matched OSM object comes with its snapshot
  - Adding a class to the eatery list
tags:
  - openstreetmap
  - nominatim
  - capture
  - dedup
---

# Keep OSM data for every venue picked, not only eateries — the eatery list is for display

## Context

Naturale (OSM node 13195359529) could not be added next to Gallika, 20 m away, even after
`osm-identity-beats-proximity-in-dedup.md`. Naturale is tagged `shop=deli`. That class was not in
the eatery list, and the eatery list also decided whether a picked result kept its OSM object. The
draft carried no identity, so the duplicate check fell back to the 50 m radius.

## Guidance

**Two questions, two predicates.** `isEatery` (a fixed class list) only orders search results:
eateries first, the rest folded. `isVenue` (an eatery, or OSM category `shop`, `craft` or
`office`) decides whether a picked or matched object brings its identity and snapshot (hours,
phone, website, zone). A street, an address, a park or a car park never does — that was the
original reason for the filter (review #2), and it still holds. Whole `amenity`, `leisure` and
`tourism` categories were tried first and dropped in review: beside eateries they hold parks, car
parks, toilets and viewpoints.

**Matching a name to OSM** (`matchNear`: pasted link, "Complete") accepts any venue but ranks an
eatery above a nearer venue that is not one, so "Paul" finds the bakery before "Optique Paul". The
user still confirms every match.

## Why This Matters

Using the eatery list as a data filter made every food shop missing from it (deli, chocolatier,
cheese shop) silently lose its hours and its identity, and so its protection against false
duplicates. Adding classes one by one only moves the next miss.

## When to Apply

- A new kind of food place should appear among the restaurants in search: add it to
  `EATERY_CLASSES`. Its OSM data is kept either way.
- A result type should never carry a snapshot: it must fall outside `VENUE_CATEGORIES`.

## Related

- Source: `src/capture/osmTags.ts` (`isEatery`, `isVenue`), `src/capture/capture.ts`
  (`draftFromCandidate`), `src/capture/geocode.ts` (`matchNear`).
- Earlier entry: `docs/journal/solutions/design-patterns/osm-identity-beats-proximity-in-dedup.md`.
