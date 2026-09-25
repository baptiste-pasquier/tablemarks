---
status: "accepted"
date: 2026-09-25
decision-makers: [Baptiste Pasquier]
---

# Store categories as OpenStreetMap values

## Context and Problem Statement

A place's category was stored as an English display name ("French", "Café"), so it could not be
translated, and a French user typing "Français" created a second category. Categories also need
to line up with OpenStreetMap, which a later prefill will read.

## Considered Options

* Keep display names, translate by lookup
* Our own slugs (`cafe`, `creperie`)
* OpenStreetMap values (`coffee_shop`, `crepe`)

## Decision Outcome

Chosen: **OpenStreetMap values**. A curated category is stored as its OSM `cuisine=*` value, or,
for the places OSM tags elsewhere, the value of that tag (`shop=bakery`, `shop=pastry`,
`amenity=bar`). A free-typed category is stored as typed. Labels live in i18n.

Every read goes through `resolveCuisine`, which matches keys and every language's labels without
regard to case or accents, so values written before this decision ("French") resolve to their key
and no migration runs.

### Consequences

* Good: a prefill from OSM maps a tag to a category without a translation table.
* Good: one category per meaning, whatever language it was picked or typed in.
* Bad: a key can never be renamed once shipped, since stored records carry it.
