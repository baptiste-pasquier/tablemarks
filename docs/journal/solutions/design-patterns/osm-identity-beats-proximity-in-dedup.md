---
title: Duplicate detection must let OSM identity overrule proximity, and check it before proximity
date: 2026-10-22
category: design-patterns
module: capture / dedup
problem_type: logic_error
component: frontend_stimulus
severity: medium
related_components:
  - frontend
applies_when:
  - Deciding whether a place being added is already saved
  - Changing the near-match radius or the order of the duplicate checks
tags:
  - dedup
  - openstreetmap
  - nominatim
  - capture
---

# Duplicate detection must let OSM identity overrule proximity, and check it before proximity

## Context

Two restaurants could not be added: Naniwa-ya (OSM node 1477602784) and On the Bab (node
7680066685), rue Sainte-Anne, Paris. Both were refused as already saved. They are distinct OSM
objects 42 m apart, and a saved neighbour sat inside the 50 m near-match radius of each.

## Guidance

**When both the new place and a saved one carry an OSM identity, that identity decides.** Same
object is a duplicate at any distance; different objects are two places at any distance. The 50 m
radius only applies when one side has no OSM identity, which is what it exists for: a Maps link
with no OSM match.

**Run the duplicate check once the OSM object is known.** Pasting a Maps link used to check
proximity first, before `matchNear` found the object, so the fix above did not reach that path.
`preview()` now matches first and checks once, with the link and the object together.

**Look for an exact match across the whole list before any proximity match.** Returning the first
record that matched on any criterion let a neighbour listed earlier hide the place itself, and the
duplicate notice opened the wrong restaurant.

## Why This Matters

In a dense street, restaurants are often 10–40 m apart, so a proximity-only rule blocks real places
without any way around it. The accepted trade-off: if OSM remaps a saved restaurant (a node replaced
by a building outline), adding it again creates a duplicate the user deletes by hand. That costs
less than a place nobody can add.

## When to Apply

- Adding a capture path: call `findNearMatch` with the OSM object when one is known, never before
  looking for it.
- Tuning the radius: it applies only to places without an OSM identity on one side.

## Related

- Source: `src/capture/dedup.ts`, `src/capture/capture.ts` (`preview`, `commitCapture`).
- Tests: `src/capture/dedup.test.ts`, `src/capture/capture.test.ts`.
