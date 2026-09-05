# `journal/solutions/` — what broke, and what the measurement said

One entry per problem solved. **Append-only**: an entry is dated and never rewritten. If a
later change supersedes it, write a new entry and link back.

Path: `journal/solutions/<category>/<kebab-case-slug>.md`

Categories in use: `architecture-patterns`, `conventions`, `database-issues`,
`design-patterns`. Add a category only when an entry does not fit an existing one.

**Read this store before implementing a fix** in a documented area. It exists so the same
wall is not hit twice.

**Never** narrate an incident in `how-to/`, `reference/` or `conventions/` — the gate fails
on one there. In `explanation/` it warns: a full write-up with symptoms and measurements
still belongs here, linked from the rule. Write the entry here and leave the distilled rule
plus a link — see [`../../conventions/documentation.md`](../../conventions/documentation.md).

## Frontmatter

This repo keeps whatever schema the compound-engineering `ce-compound` skill already writes
(`title`, `date`, `category`, `module`, `last_updated`). Do not invent a second schema — the
plugin will keep writing its own, and `category` is not cross-checked against the folder
here (see `conventions/documentation.md` for why).

## Example

[`architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md`](architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md)
is the entry to copy: it states the mapping problem, what was measured, and the resulting
rule, with `last_updated` bumped as the mapping evolved.
