# AGENTS.md — TableMarks

A routing table, not a manual: which file to open, and what never to do. Budget 8 KB — adding a
line here means removing one.

## Overview

React 19 SPA (TypeScript, hooks, Tailwind v4, i18next, Leaflet, Vite 7, vite-plugin-pwa) for
tracking restaurants and visits. **Local-first**: IndexedDB is canonical, PocketBase is an
optional mirror. Design: `docs/explanation/architecture.md`. Vocabulary: `CONCEPTS.md`.

**Principles:** SOLID, DRY, KISS, YAGNI — YAGNI beats DRY until the **third** occurrence, KISS
beats SOLID until a **second** implementation exists. Name the arbitration in the PR description.

## Commands

`npm run` lists them all; only these are not obvious:

```bash
npm test                                  # single pass, what CI runs (test:watch watches)
npx vitest run src/lib/dates.test.ts      # one file; -t "name" for one test
npx eslint . && npx prettier . --check    # check mode; `npm run lint` and `format` rewrite files
npx vite build --mode demo --base=/tablemarks/ && sh scripts/check-demo-target.sh dist
npm run test:e2e                          # Playwright on the demo build (needs `npx playwright install chromium webkit`)
```

## Architecture invariants

Three layers, one direction: features → `src/data/` (IndexedDB) → `src/sync/` (PocketBase). That
direction is what makes the app behave identically with or without an account.

- Do not import `src/sync/` from a feature — features call the repository and react to its events.
- Do not touch IndexedDB outside `src/data/` — the repository owns every local read and write, and
  stamps `id`, `updated`, `deleted`.
- Do not talk to PocketBase outside `src/sync/` — `src/sync/pocketbase.ts` is the only client.
- Do not emit a store change before the write commits (see the `conventions/` journal entry).
- Do not store a derived value — Status and Rollup derive from Visits, which stay separate records
  precisely so last-write-wins stays safe across devices.
- Do not collapse the three configuration states — `configured | absent | unavailable`. `absent`
  is an answer and never retries; `unavailable` is the only one that does.
- Do not bake the backend URL into the build — it is read at boot from `config.json`. No `VITE_*`
  variable for it, ever (ADR-0001).
- Do not use a root-absolute path for a runtime asset — the demo is served from a repo subpath, so
  derive it from `import.meta.env.BASE_URL`.
- Do not add UI state to `App.tsx` — extract a state hook (facets, selection) beside its feature.
  At 554 lines it is over the limit below and is the example, not the pattern.

## Storage and PocketBase

IndexedDB `tablemarks` v1 is canonical and doubles as the durable sync outbox; localStorage holds
only device-local preferences, keyed `tablemarks:<domain>` (`tablemarks:sortPreference`). Record
shapes and local↔remote mapping: `docs/reference/data-model.md`.

- Every collection is owner-scoped, and `updateRule` also guards `@request.body.owner`: an update
  rule is evaluated against the **stored** record, so without that clause a caller can PATCH a
  record into another account (measured — see `database-issues/`). `users.createRule` stays closed
  to `@request.context = "oauth2"`; "must be authenticated" would break the first sign-in.
- Reconciliation is last-write-wins on `updated`, keyed by `id`, tombstones included. A sign-in
  starts with a one-time union reconcile; signing out leaves local data intact.
- Import is source → validate → commit: the `tablemarks-export` envelope is versioned, an unknown
  version is refused whole, and no relation id is ever exported.
- In `docker/`: the `TABLEMARKS_*` prefix is what makes `NGINX_ENVSUBST_FILTER` safe,
  `security-headers.conf` is copied verbatim and never templated, `config.json` is served
  `no-store`, and version pins live in `ARG` defaults.

## Code style

`.prettierrc.json` and `eslint.config.ts` own the rest; ESLint is deliberately not type-aware, so
type errors stay `npm run type-check`'s job. What neither can check:

- Relative imports, ordered framework → third-party → components → data/sync/lib/types → CSS,
  with `import type` for type-only imports. No barrel files, no `any`.
- `function` declarations for named module functions; arrows for callbacks and inline handlers.
- i18n keys are typed through `src/types/i18next.d.ts` — a missing key is a compile error. No
  user-facing string literal in a component; `en` and `fr` carry the same keys.

**Naming:** `camelCase` for variables, functions and non-component files; `UPPER_SNAKE_CASE` for
constants; `PascalCase` for types and `.tsx`; tests co-located `<subject>.test.ts(x)`; storage
keys `tablemarks:<domain>`.

**Size limits:** 300 lines per module, 250 per component, 60 per function. Over the limit means a
second responsibility to extract — a state hook, a mapper, a controller — not a file cut in half.

## UI and Tailwind

1. **Primitives first:** check `src/features/ui/` before writing classes for a button, badge, chip
   or section header — `Button`, `Badge`, `ToggleChip`, `Eyebrow`, `Modal`, `ModalHeader`.
2. **Rule of three:** never copy a complex class string across files. At the third occurrence,
   halt the feature work and extract a shared, tested component into `src/features/ui/`.
3. **Extend, don't abandon:** if a primitive almost fits, extend its variant API (the `Modal.tsx`
   `Record` map pattern). Do not create a one-off styling exception.
4. **Use the utility:** never concatenate classes by hand — `cn()` in `src/lib/cn.ts`.

**Errors:** every failure of a user-triggered action reaches the user, and a bootstrap or realtime
failure reaches the sync status. `console.error` alone is not handling.

## Documentation and knowledge stores

Read `docs/README.md` before writing under `docs/`; full rules in
`docs/conventions/documentation.md`, gated by `npm run check:docs` (pre-commit and CI). Maintained
folders are truth, `docs/journal/` is append-only and never cited as truth; read the relevant
`docs/journal/solutions/` category (`architecture-patterns/`, `conventions/`, `database-issues/`,
`design-patterns/`) **before** a fix. `CONCEPTS.md` holds the domain vocabulary, and Context7
answers library questions without being asked.

**A plugin's dated artifacts are journal entries, and these paths override the plugin's own:**
brainstorming → `docs/journal/specs/`, plans → `docs/journal/plans/`, compound-engineering
artifacts → under `docs/journal/`. Only the directory is ours — keep the plugin's filename and
frontmatter, and cite a repo file as a backticked path, not a link.

## You changed X → update Y

| Changed                                             | Update                                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| the sync engine, the data model, or a schema        | `docs/reference/data-model.md` + a migration             |
| core behaviour or the local-first/sync design       | `docs/explanation/architecture.md`                       |
| setup, scripts, testing, or the PocketBase backend  | `docs/how-to/development.md`                             |
| a deployment target, the images, or the proxy       | `docs/how-to/deployment.md`                              |
| a non-obvious fix, or something you measured        | `docs/journal/solutions/<category>/`                     |
| a lasting architectural choice                      | a new ADR in `docs/journal/decisions/`                   |
| a color, a radius, a shadow, or the cuisine palette | `docs/reference/design-tokens.md`                        |
| a domain term                                       | `CONCEPTS.md`                                            |
| user-facing behaviour, setup, local workflow        | `README.md`                                              |
| what an agent must always know                      | this file — and remove a line, or say why none had to go |
