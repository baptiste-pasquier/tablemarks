## 📝 `README.md`

**Keep it simple and user-friendly** — an inviting, high-level landing page accessible to
newcomers: a clear project description, prerequisites, a "Quick Start", a basic usage
example. Do not dump extensive API references or deep technical architecture into it; link
to `docs/` instead (e.g. `[Architecture](docs/explanation/architecture.md)`), and keep those
links intact and accurate after updates.

## Documentation

`docs/` has one topology and one routing rule. **Read [`docs/README.md`](docs/README.md)
before creating or substantially extending anything under `docs/`.** Full rules:
[`docs/conventions/documentation.md`](docs/conventions/documentation.md).

### Where a paragraph goes

Two axes. **Lifecycle first**: the four folders below are *maintained* and are the sources
of truth; `docs/journal/` is *append-only*, dated, and **never cited as truth**. Then, for
maintained text, the [Diátaxis](https://diataxis.fr/compass/) compass — run it on **the
paragraph**, not on the file you have open.

| The content… | …serves the reader… | …belongs in |
| --- | --- | --- |
| informs **action** | **applying** a skill (working) | `docs/how-to/` |
| informs **action** | **acquiring** a skill (studying) | a tutorial — we have none, so `docs/how-to/` |
| informs **cognition** | **applying** a skill (working) | `docs/reference/` |
| informs **cognition** | **acquiring** a skill (studying) | `docs/explanation/` |

Four extensions, for text that is not about the product:

| The paragraph… | belongs in |
| --- | --- |
| tells a future writer or agent what to do | `docs/conventions/` |
| recounts what was tried, failed, or was measured | `docs/journal/solutions/` |
| records a choice between options | `docs/journal/decisions/` |
| names something not built yet | a GitHub issue |

A maintained doc states the rule **once** and links the journal entry for the evidence. It
does not retell the story.

### Rules that are enforced

`scripts/check_docs.py` runs via a Husky pre-commit hook (`npm run check:docs` to run it
by hand — there is no CI in this repo yet). These fail:

- **Never narrate a past attempt, failure, or measured symptom in `docs/reference/`,
  `docs/conventions/` or `docs/how-to/`.** Write a `docs/journal/solutions/` entry
  (template: [`docs/journal/solutions/README.md`](docs/journal/solutions/README.md)) and
  leave the distilled rule with a link. This applies whether or not the compound-engineering
  plugin wrote the paragraph.
  `docs/explanation/` **may** narrate — that is what explanation is for — so the gate
  **warns** there rather than failing. A full write-up with symptoms and measurements still
  belongs in a journal entry, linked. `docs/journal/` is exempt: narrating what failed is
  its purpose.
- **Never add a backlog, TODO or "future work" section under `docs/`** — open a GitHub
  issue instead. A `TODO` comment in a source file is fine, and a doc may point at one; a
  *list* of unbuilt work in prose is not.
- **Every maintained doc carries frontmatter** with `title`, `type` (equal to its folder
  name), `audience`, `status`, `stale_after`, and appears in `docs/README.md`. A key present
  but empty counts as missing. A passed `stale_after` **warns** rather than fails, so a
  review date cannot redden an unrelated PR.
- **`docs/conventions/documentation.md` opens with a `Scope:` line** naming the artifact it
  governs.
- **Every relative link and every `#fragment` resolves.**
- **Filenames are kebab-case**, and a `docs/journal/decisions/` entry is
  `NNNN-with-dashes.md`.

### Rules that are reviewed, not gated

- **Before implementing a fix or a non-obvious behaviour change, check
  `docs/journal/solutions/`** for an entry in the relevant category — organized by
  `architecture-patterns/`, `conventions/`, `database-issues/`, `design-patterns/`.
- **Record a lasting architectural choice as an ADR** under `docs/journal/decisions/`. An
  accepted decision is never edited — a change adds a new entry marking the old superseded.
- **Documentation prose**: lead with the conclusion; one claim per paragraph; no filler or
  hedging; prefer a table to enumerative prose.
- **A PR that adds prose to a maintained doc says what it removed, or why nothing needed
  removing.** The size check only warns, so this is what catches growth nobody looked at.

### What to update when

| You changed | Update |
| --- | --- |
| the sync engine, data model, or a schema shape | `docs/reference/data-model.md` |
| core behaviour or the local-first/sync design | `docs/explanation/architecture.md` |
| setup, scripts, testing, or the PocketBase backend | `docs/how-to/development.md` |
| user-facing behaviour, setup, local workflow | `README.md` |
| what an agent must always know | this file |

## Knowledge stores

* `docs/journal/solutions/` — documented solutions to past problems (bugs, best practices, architecture patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
* `CONCEPTS.md` — shared domain vocabulary (entities, named processes, status concepts). Relevant when orienting to the codebase or discussing domain terms.

## UI & Tailwind Directives

1. **Use Primitives First:** Always check `src/features/ui/` before writing new Tailwind classes for buttons, badges, chips, or section headers. You must use existing primitives (`Button`, `Badge`, `ToggleChip`, `Eyebrow`) instead of hand-rolling custom HTML.
2. **The Rule of Three:** Never copy-paste complex Tailwind class strings (e.g., hover/active states, safe-area math, complex flex alignments) across multiple files. If a specific UI pattern appears in 3 or more places, halt your feature work and extract it into a shared, tested component in `src/features/ui/`.
3. **Extend, Don't Abandon:** If an existing primitive almost fits but needs a tweak (e.g., a new disabled state or color), extend its variant API (like the `Modal.tsx` `Record` map pattern). Do not abandon the primitive to create a one-off styling exception.
4. **Use the Utility:** Never concatenate classes with raw template literals. Always use the `cn()` helper in `src/lib/cn.ts` for conditional Tailwind styling.
