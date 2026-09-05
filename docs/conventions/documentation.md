---
title: Documentation conventions
type: conventions
audience: [agent, human]
status: stable
stale_after: 2027-03-15
---

# Documentation conventions

**Scope: the prose in `docs/`.**

## Placement

The routing table lives in [`../README.md`](../README.md) and is not repeated here. Run the
compass on **the paragraph**, not on the file you happen to have open. That is what stops a
paragraph landing in a doc merely because that doc was already open.

### Never narrate an incident in a maintained doc

A passage that recounts a past attempt, a failure, or a measured symptom does not belong in
`how-to/`, `reference/` or `conventions/`. The gate fails on one there.

`explanation/` is the exception, and the gate only warns: explaining why the code is shaped
this way sometimes needs the attempt that failed. What still does not belong there is the
**full write-up** — symptoms, measurements, a traceback. That is a journal entry, and the
explanation links it.

`journal/` is exempt outright. Recording what failed is what it is for.

Markers the gate looks for: `used to be`, `we tried`, `before this fix`, `an earlier version did X`, `3 attempts out of 4`.

Write it as a [`journal/solutions/`](../journal/solutions/README.md) entry. Leave behind
**the distilled rule, one or two sentences, plus a link**.

This applies whether or not the compound-engineering plugin wrote the paragraph.

### What stays inline

A hard-won **invariant** is explanation, not an incident. It stays.

The test: **would a reader who never saw the bug still need this to work on the code?** Yes
means it is explanation. No means it is a journal entry.

### Never write a backlog

No `TODO` section, no "future work", no "not yet implemented" list anywhere in `docs/`, and
**link the issue** rather than describing the missing work.

Unbuilt work lives in the issue tracker and nowhere else:

```bash
gh issue list --label backlog          # what is known, wanted, and not built
gh issue create --label backlog        # add an item
```

There is deliberately no mirror under `docs/`: this repo has no CI and no branch-protection
tier that would let a workflow refresh one automatically (checked directly — GitHub's
ruleset/branch-protection APIs return 403 on this repo's plan), so a `docs/BACKLOG.md`
would be a copy nobody refreshes, which is worse than no copy. Reconsider only once a
workflow can push to the default branch — see `references/backlog.md` in the
`docs-taxonomy` skill for the mirror and its refresh mechanism.

A `TODO` comment in a source file is fine, and a doc may point at one. What is banned is a
**list of unbuilt work** inside prose, because nothing ever prunes it.

### Record a lasting choice as a decision

A library choice, a pattern, a schema shape with cross-cutting consequences: write an entry
in [`journal/decisions/`](../journal/decisions/README.md). An accepted decision is never
edited — a change adds a new entry marking the old one superseded.

### Read before you fix

Before implementing a fix or a non-obvious behaviour change, check
[`journal/solutions/`](../journal/solutions/) for an entry in the relevant category. That
store exists so the same wall is not hit twice.

## Prose

These rules govern documentation prose. They are what keeps a doc legible once the incident
narratives are gone.

### Lead with the conclusion

The rule or the fact leads the paragraph. Justification and mechanism follow. A reader who
stops after the first sentence still has the point.

### One claim per paragraph

A paragraph that argues two things splits into two.

This is the anti-accretion mechanism, and it is why the rule exists rather than a line
limit. A single-claim paragraph is individually replaceable: the next writer edits it or
deletes it. A multi-claim paragraph resists that, so the next writer appends a third claim,
and the paragraph grows instead of changing.

### No filler, no hedging

Every sentence carries a fact, a rule, or a pointer.

Banned openers, checked by the gate: `it is worth mentioning that`, `it should be noted that`, `it is important to note that`, `as mentioned previously`.

Delete a hedging adverb — `arguably`, `somewhat`, `possibly`. Uncertainty is different from
hedging: state it as a fact about what is known.

### Prefer a table to enumerative prose

Three or more cases in one sentence become a table. `reference/data-model.md`'s field and
verdict tables are the pattern to copy.

## Language

All of `docs/` is English, journal included — this repo mixes no other language, so there is
no gate rule for it. If that changes, add one here and in `scripts/check_docs.py`
(`SECOND_LANGUAGE_MARKERS`) rather than leaving it to review.

## Frontmatter

Every maintained doc:

```yaml
---
title: Title
type: explanation | how-to | reference | conventions   # must equal the parent folder
audience: [human, agent]
status: stable                                          # draft | stable | deprecated
stale_after: YYYY-MM-DD
---
```

`stale_after` is an absolute date rather than a `last_reviewed` one on purpose: a review
date has to be remembered, and an expiry announces itself. When one fires, re-date the doc
or fix what drifted. It warns and never fails, because a shared expiry date would otherwise
redden every unrelated PR on one day. The three docs in this repo are staggered a month
apart for exactly that reason.

`journal/plans/` and `journal/ideation/` keep whatever frontmatter the compound-engineering
plugin already writes (`title`, `type`, `date`, `origin`, plus a `status` this repo adds by
hand: `shipped` once the plan has landed). `journal/solutions/` keeps the schema in
[`journal/solutions/README.md`](../journal/solutions/README.md). Neither is required to
declare a `category` matching its folder — this repo's `category` values name a
sub-classification (`architecture-patterns`, `conventions`, …), not the full path from the
repository root, so that check is switched off (`CATEGORY_KEY = None` in
`scripts/check_docs.py`) rather than fought.

## Every `conventions/` file states its scope

Line one of the body, before anything else: what artifact this file governs. The gate fails
without it. Today this is the only `conventions/` file; a second one (for prompt text, say)
states its own scope the same way rather than being folded into this one.

## Review

**A pull request that adds prose to a maintained doc says what it removed, or why nothing
needed removing.** This is the compensation for the size check being a warning rather than a
failure. Growth is not the defect on its own; growth that nobody looked at is.

## The gate, mechanically

This is an npm/TypeScript project with no other Python tooling, so the gate skips the
Python `pre-commit` framework and PyYAML: `scripts/check_docs.py` parses frontmatter with a
small stdlib-only parser (flat `key: value` pairs are all this repo's frontmatter uses) and
is wired through [Husky](https://typicode.github.io/husky/) — `.husky/pre-commit` runs
`npm run check:docs` when a staged file is under `docs/`. There is no CI in this repo yet, so
the hook is the only enforcement point; `git commit --no-verify` bypasses it. Add a CI step
running `npm run check:docs` if that gap matters before Husky does.
