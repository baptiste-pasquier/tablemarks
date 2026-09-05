# Tablemarks documentation

Start here. This file is the map, and it carries the one rule for deciding where a new
paragraph goes.

## Two axes

**Lifecycle first.** Is this text *maintained*, or is it a *dated record*?

- The folders below the line are **maintained**. They are edited, pruned, and kept true.
  They are the sources of truth.
- `journal/` is **append-only**. Entries are dated, never revised, and **never cited as
  truth**. A maintained doc may link a journal entry; a journal entry never governs code.

**Then, for maintained text, the [Diátaxis](https://diataxis.fr/) quadrant.**

| Folder | The question it answers | Shape |
| --- | --- | --- |
| [`explanation/`](explanation/) | *Why does it work this way?* | Narrative allowed. Human-first. |
| [`how-to/`](how-to/) | *How do I reach this goal?* | Numbered steps. |
| [`reference/`](reference/) | *What is true?* | Tables and contracts. No narrative. |
| [`conventions/`](conventions/) | *What must I do when I write?* | Imperative, checkable. Agent-first. |
| [`journal/`](journal/) | *What happened, and what did we decide?* | Dated records. |

There is no `tutorials/` folder. Diátaxis's fourth quadrant is real, but nothing here is a
tutorial yet, and it warns against empty quadrants. When one is written, it gets its folder.

## Where does this paragraph go?

The **Diátaxis compass**, two questions in order. It works at paragraph scale, which is the
scale at which docs actually drift.

| The content… | …serves the reader… | …belongs in |
| --- | --- | --- |
| informs **action** | **applying** a skill (working) | `how-to/` |
| informs **action** | **acquiring** a skill (studying) | a tutorial — we have none, so `how-to/` |
| informs **cognition** | **applying** a skill (working) | `reference/` |
| informs **cognition** | **acquiring** a skill (studying) | `explanation/` |

Four extensions, for text that is not about the product:

| The paragraph… | goes to | never to |
| --- | --- | --- |
| tells a future writer or agent what to do | `conventions/` | `explanation/` |
| recounts what was tried, what failed, what was measured | `journal/solutions/` | anywhere maintained |
| records a choice between options | `journal/decisions/` | `explanation/` |
| names something not built yet | a GitHub issue | prose, anywhere |

**The rule that keeps this from sprawling:** a maintained doc states the rule **once** and
links the journal entry for the evidence. It does not retell the story.

Full rules, including how to write the sentence itself:
[`conventions/documentation.md`](conventions/documentation.md).

## The index

Every maintained doc appears here. A doc missing from this list fails the gate.

### `explanation/`

- [`architecture.md`](explanation/architecture.md) — the local-first design, sync, and offline behavior

### `how-to/`

- [`development.md`](how-to/development.md) — setup, project structure, testing, and the optional PocketBase backend

### `reference/`

- [`data-model.md`](reference/data-model.md) — record shapes, verdicts, the rollup, and local↔remote mapping

### `conventions/`

- [`documentation.md`](conventions/documentation.md) — where a paragraph goes, and how to
  write it. Governs the prose in `docs/`

### `journal/`

- [`decisions/`](journal/decisions/) — one architectural choice per entry, MADR format.
  An accepted decision is never edited
- [`solutions/`](journal/solutions/) — what broke, what was tried, what the measurement
  said. Read the relevant category before implementing a fix
- [`plans/`](journal/plans/) — shipped implementation plans, kept for provenance
- [`ideation/`](journal/ideation/) — requirements exploration that fed a plan

Templates: [`solutions/README.md`](journal/solutions/README.md),
[`decisions/README.md`](journal/decisions/README.md).

## Not in this tree

| What | Where | Why |
| --- | --- | --- |
| Backend schema, OAuth setup, the short-link resolver hook | [`pocketbase/README.md`](../pocketbase/README.md) | Owned by the `pocketbase/` sub-project; linked from `reference/data-model.md` and `how-to/development.md` |
| Unbuilt work | the issue tracker, `gh issue list --label backlog` | No mirror in this tree — see `conventions/documentation.md` |
| Agent-facing conventions not about docs prose | [`AGENTS.md`](../AGENTS.md) | This tree governs the prose in `docs/` only |

## What the gate enforces

`scripts/check_docs.py` runs via a pre-commit hook and can be run manually
(`npm run check:docs`). It fails on:

1. a file whose `type` does not match its folder, or a file in an unknown folder
2. missing or invalid frontmatter — a key present but empty counts as missing
3. a relative link, or a `#fragment`, that does not resolve
4. a maintained doc missing from the index above
5. past-tense incident narration in `reference/`, `conventions/` or `how-to/`
6. a banned filler phrase
7. an unresolved `{{template placeholder}}` left in any doc, journal included
8. a section headed `TODO`, `Backlog`, `Future work`, `Roadmap` or `Open questions`
9. a filename that is not kebab-case, or an ADR not named `NNNN-with-dashes.md`
10. a `conventions/` file that does not open with a `Scope:` line
11. a loose file at the root of `docs/`, an unexpected file type, or a symlinked folder

It **warns**, without failing, on: incident narration in `explanation/`, a maintained doc
past its folder's prose-line guideline (`reference/`: 250, others: 150), and a `stale_after`
date that has passed. Those never fail because neither depends on the change being
reviewed — an expiry would otherwise redden every unrelated PR on the day it fires.
Narration warns in `explanation/` because that is the one folder allowed to narrate; the
warning only asks whether the write-up belongs in a journal entry, linked.

`docs/journal/` is exempt from rules 5, 6 and 8. It is append-only: an entry records what
was measured, in the words used at the time, and cannot be corrected into compliance later.
It is not exempt from rule 7: a journal entry copied from a template still owes a filled-in
placeholder.

There is no `docs/BACKLOG.md` mirror and no `category` cross-check on journal entries in
this repo — see `conventions/documentation.md` for why.
