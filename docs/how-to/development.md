---
title: Development
type: how-to
audience: [human, agent]
status: stable
stale_after: 2027-05-01
---

# Development

## Prerequisites

- Node.js ≥ 20.19 (Vite 7 requirement)
- npm

## Setup

```bash
npm install
npm run dev
```

**A plain `npm run dev` starts the app with no backend.** `public/config.json` ships
`{"pocketbaseUrl": ""}`, and the app reads its backend location from that file at runtime. With
an empty value there is no sign-in, no sync, and a pasted `maps.app.goo.gl` short link is refused
on the capture surface. That is a valid state, not an error — the app is local-first and every
other feature works. To attach a local PocketBase, see
[Optional: PocketBase backend](#optional-pocketbase-backend) below.

## Scripts

| Command              | What it does                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`        | Vite dev server with HMR                                                                                                                                                |
| `npm test`           | Run the Vitest suite once                                                                                                                                               |
| `npm run test:watch` | Vitest in watch mode                                                                                                                                                    |
| `npm run type-check` | Type-check (`tsc --noEmit`)                                                                                                                                             |
| `npm run lint`       | ESLint over the repository, fixing what it can (`eslint . --fix`)                                                                                                       |
| `npm run format`     | Prettier over the repository (`prettier . --write`)                                                                                                                     |
| `npm run build`      | Type-check, then build for production                                                                                                                                   |
| `npm run check:docs` | Documentation gate — the same one the pre-commit hook and CI run                                                                                                        |
| `npm run check:demo` | Refuse a tree that would put a service worker or manifest on the Pages origin. Add a build directory (`sh scripts/check-demo-target.sh dist`) to check the artifact too |

## Project structure

```
src/
├── types/models.ts          Restaurant, Visit, Verdict, sync fields
├── data/                    Repository over IndexedDB (the only IDB access)
│   ├── db.ts, ids.ts, events.ts
│   ├── restaurants.ts, visits.ts, rollup.ts
├── sync/                    The only code that talks to PocketBase
│   ├── pocketbase.ts, reconcile.ts, mappers.ts, syncEngine.ts
├── auth/                    Google SSO + account mode
├── capture/                 parseMapsUrl, geocode, dedup, capture orchestrator
├── features/                UI: map, list, capture, visit detail
└── test/                    Test helpers (fresh IndexedDB, setup)
pocketbase/                  Backend: pb_migrations, pb_hooks (see its README)
docs/                        This documentation + pipeline artifacts
```

The dependency direction is one-way: `features → data → IndexedDB`, and only `sync` reaches PocketBase. See [architecture.md](../explanation/architecture.md) for why.

## Testing

- **Framework:** Vitest + Testing Library, jsdom environment.
- **IndexedDB:** tests use `fake-indexeddb`; data/repository tests import `freshDB` from `src/test/idb.ts` and call it in `beforeEach` for a clean store per test.
- **What's unit-tested:** the pure logic that carries the risk — reconcile, mappers, `parseMapsUrl`, dedup, rollup, the repositories, and the capture/visit UI flows.
- **What's verified at runtime, not in jsdom:** the live PocketBase round-trip, the Google OAuth popup, and Leaflet map rendering (jsdom has no layout dimensions, so `MapContainer` is stubbed in component tests).

When adding a feature, follow the conventions in [AGENTS.md](../../AGENTS.md): extract pure logic and test it; keep PocketBase access inside `src/sync/`; never import `idb` outside `src/data/`.

## Optional: PocketBase backend

The app runs without PocketBase. To enable Google sign-in and cross-device sync:

1. Download a PocketBase v0.39.3 binary into `pocketbase/` — the version
   `docker/Dockerfile.pocketbase` pins, so local behaviour matches the deployed image.
2. `cd pocketbase && ./pocketbase serve` — migrations and hooks load automatically.
3. Configure Google OAuth in the admin UI.
4. Point the app at it by editing `public/config.json`:

   ```json
   { "pocketbaseUrl": "http://127.0.0.1:8090" }
   ```

   The backend location is read at runtime from this served file, not from a build-time
   variable — see
   [ADR-0001](../journal/decisions/0001-read-the-backend-location-at-runtime.md). Keep the
   edit out of your commits: the committed value is the empty string, which is what the public
   demo build ships.

Full backend setup — collections, OAuth steps, the short-link resolver hook, and the local↔remote field mapping — is in [pocketbase/README.md](../../pocketbase/README.md).

Deploying to a real host — the PocketBase console sequence, upgrades, rollback and recovery — is in [deployment.md](deployment.md).

## Conventions

TypeScript strict with `erasableSyntaxOnly` (no parameter properties, enums, or namespaces), conventional commit messages, repo-relative paths. See [AGENTS.md](../../AGENTS.md) for the full list.

Style is not a matter of taste here: Prettier (100 columns, no semicolons, single quotes) and ESLint run over the staged files at every commit through `lint-staged`, and again in check mode in CI, so a commit that skips the hook still does not get past review. `docs/journal/` is excluded from formatting — its entries are append-only, and reformatting one rewrites a record read as it was written.
