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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | Type-check (`tsc --noEmit`) |
| `npm run build` | Type-check, then build for production |

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

1. Download a PocketBase v0.26.x binary into `pocketbase/`.
2. `cd pocketbase && ./pocketbase serve` — migrations and hooks load automatically.
3. Configure Google OAuth in the admin UI.
4. Point the app at it with `VITE_PB_URL` (defaults to `http://127.0.0.1:8090`).

Full backend setup — collections, OAuth steps, the short-link resolver hook, and the local↔remote field mapping — is in [pocketbase/README.md](../../pocketbase/README.md).

## Conventions

TypeScript strict with `erasableSyntaxOnly` (no parameter properties, enums, or namespaces), conventional commit messages, repo-relative paths. See [AGENTS.md](../../AGENTS.md) for the full list.
