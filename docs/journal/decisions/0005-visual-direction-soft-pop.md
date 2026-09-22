---
status: "accepted"
date: 2026-09-21
decision-makers: [Baptiste Pasquier]
---

# Replace the Carnet culinaire identity with Soft Pop

## Context and Problem Statement

Tablemarks shipped a deliberate visual identity in August 2026 — "Carnet culinaire": warm
parchment neutrals, terracotta and deep teal, Playfair Display over Work Sans. It was decided
inside an implementation plan, never in an ADR, so nothing recorded what it committed to.

Three faults were named against it: the sepia neutrals read as dated, the serif reads as a
magazine rather than an app, and the radii and shadows belong to an earlier idiom. Separately,
the cuisine palette had a defect of its own — twelve fixed hexes holding three near-identical
oranges and three near-identical reds, plus only eight fallback colors for the open-ended
cuisines users type themselves.

## Decision Drivers

* The primary use is deciding where to eat while standing outside, one-handed
* The cuisine vocabulary is open, so the palette must serve colors nobody curated
* A solo project: no brand guideline to honour, and no migration to stage

## Considered Options

* Clean Utility — indigo on cool zinc, Inter, 1px hairlines
* Soft Pop — a green accent on neutral grays, Plus Jakarta Sans, borderless cards, soft shadows
* Ink & Signal — near-black and acid yellow, Space Grotesk, hard offset shadows

## Decision Outcome

Chosen: **Soft Pop**, because generous touch targets and no hairlines to aim at serve a phone
held in one hand better than the alternatives. Clean Utility was the safest and the least
memorable; Ink & Signal was the most distinctive and the most tiring for an app opened daily.

The cuisine palette was rebuilt at the same time, since a new accent color would have had to be
reconciled with twelve fixed hexes regardless. A cuisine now carries a hue, and the pill, marker
and dot forms derive from it — which extends the contrast guarantee to cuisines nobody curated.

### Consequences

* Good: retinting the app is an edit to `src/index.css` alone, because every token name survived
* Good: a free-text cuisine gets the same contrast floor as a curated one, measured not assumed
* Bad: greens and cyans render less saturated than reds and blues, because sRGB cannot hold the
  nominal chroma at those hues
* Bad: the eleven-hue wheel has no spare angle, so a thirteenth curated cuisine forces a re-space

## More Information

Design and measurements: `docs/journal/specs/2026-09-21-visual-direction-soft-pop-design.md`.
The token contract: `docs/reference/design-tokens.md`. The mark was redrawn in the same pass —
three pins on a pale street plan, chosen over eleven alternatives for saying "a collection"
rather than "a place".
