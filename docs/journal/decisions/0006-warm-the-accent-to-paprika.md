---
status: "accepted"
date: 2026-09-22
decision-makers: [Baptiste Pasquier]
---

# Warm the Soft Pop accent from green to Paprika orange

## Context and Problem Statement

ADR-0005 chose Soft Pop with a green accent. In use the green read as cold, and white surfaces on
a white page had no edge — tiles, chips and secondary buttons blurred into the background. This
amends the accent and the page color only; the rest of Soft Pop stands.

## Considered Options

* Mandarine `#f76b15` — the brightest; white text at 2.97:1
* Paprika `#ea580c` — a true orange, neither red nor yellow; 3.56:1
* Terre cuite `#d9480f` — earthier; 4.30:1
* Brûlé `#c2410c` — the only one to pass AA at 5.18:1

## Decision Outcome

Chosen: **Paprika**, on a neutral gray canvas `#f3f4f6` that covers the whole interface. Brûlé
was the only accessible option, but at that depth orange turns back into the terracotta of the
identity ADR-0005 replaced. Paprika still reads better than the green it replaces (3.02:1).

A red-leaning orange was ruled out because it crowds "never again"; for the same reason
"worth a detour" moved from amber to indigo `#4338ca`, since an amber verdict chip beside an
orange cuisine chip was indistinguishable.

### Consequences

* Good: surfaces separate by being white on gray rather than by shadow alone
* Good: the accent now appears only where it means action or selection
* Bad: white on the primary button stays under AA; brand-colored text must use `brand-strong`
* Bad: secondary text had to darken to `gray-600` wherever it sits on the canvas

## More Information

The token contract and every figure above: `docs/reference/design-tokens.md`.

## Amendment — 2026-09-22

The gray canvas was reverted the same day, at the owner's preference for white. The page is
white again, and surfaces separate by `--shadow-card` and `--shadow-chip` alone, as they did
before this decision. Paprika, the indigo detour and the darker secondary text stand.
