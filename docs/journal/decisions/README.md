# `journal/decisions/` — architectural decision records

One architectural choice per entry, in [MADR 4.0.0](https://adr.github.io/madr/) format.

Path: `journal/decisions/NNNN-title-with-dashes.md` — `NNNN` a consecutive four-digit
number, the title lowercase and dash-separated.

This folder holds the template below and the decisions recorded since it existed. No
decisions have been backfilled into it — see below.

## An accepted decision is never edited

A decision that changes gets a **new** entry. The new entry says what it supersedes; the old
entry's `status` becomes `superseded by ADR-NNNN`. Nothing is deleted.

This is what makes the folder readable as a history rather than as a snapshot. An edited ADR
loses the only thing it was for: what was believed at the time, and why.

**No backfill.** Tablemarks made real architectural choices — local-first storage,
last-write-wins reconciliation, the returnability verdict instead of a numeric score — before
this folder existed, and they stay unwritten here. Inventing rationale after the fact
produces a record nobody can trust. [`explanation/architecture.md`](../../explanation/architecture.md)
already states the current shape of those choices; only a *change* to one of them gets an
ADR from this point forward.

## When to write one

A library choice, an architectural pattern, or a schema shape with cross-cutting
consequences — something a future reader would otherwise have to reverse-engineer from the
code and would reasonably question.

Not: a bug fix (that is [`../solutions/`](../solutions/README.md)), and not an
implementation plan (that is [`../plans/`](../plans/)).

## Template

```markdown
---
status: "proposed | rejected | accepted | deprecated | superseded by ADR-0123"
date: YYYY-MM-DD
decision-makers: [who decided]
consulted: [who was asked]        # optional
informed: [who was told]          # optional
---

# Short title, naming the problem and the chosen solution

## Context and Problem Statement

What forces are at play. Make the scope explicit — name the components affected.

## Decision Drivers            <!-- optional -->

* a desired quality, a constraint, a force

## Considered Options

* option 1
* option 2

## Decision Outcome

Chosen option: "option 1", because …

### Consequences               <!-- optional -->

* Good, because …
* Bad, because …

### Confirmation               <!-- optional -->

How compliance with this decision is checked — a test, a lint rule, a review step.

## Pros and Cons of the Options    <!-- optional -->

## More Information                <!-- optional -->
```

`Confirmation` is worth filling in whenever a mechanical check is possible. A decision with
a CI gate behind it survives; one that relies on memory does not.
