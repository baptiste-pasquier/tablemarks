# Tablemarks

Save your favorite and to-try restaurants on a map. Tablemarks is **local-first**: it works fully in your browser with no account, and signing in with Google backs up and syncs your places across devices.

- Paste a Google Maps link (or search by name) to add a place in seconds
- Track visits with a simple returnability verdict — *Go back · Worth a detour · Once was enough · Never again*
- Filter by cuisine and status, all on a map
- Your data lives in your browser; the cloud is an optional mirror

## Prerequisites

- Node.js ≥ 20.19
- npm
- (Optional) A [PocketBase](https://pocketbase.io) binary for Google sign-in and cross-device sync

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL. You can add and browse restaurants immediately — no account needed.

To enable Google sign-in and sync, run a PocketBase instance alongside the app — see [docs/development.md](docs/development.md#optional-pocketbase-backend) and [pocketbase/README.md](pocketbase/README.md).

## Usage

- **Add a place:** click *+ Add a place*, paste a Google Maps link or type a name, and save.
- **Log a visit:** open a place and tap *I'm here now*, then pick a verdict.
- **Sign in (optional):** use *Sign in with Google* to back up and sync; signing out keeps your local data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the test suite |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Type-check only |

## Documentation

- [Architecture](docs/architecture.md) — the local-first design, sync, and offline behavior
- [Data model](docs/data-model.md) — record shapes, verdicts, the rollup, and local↔remote mapping
- [Development](docs/development.md) — setup, project structure, testing, and PocketBase
- [PocketBase backend](pocketbase/README.md) — collections, Google OAuth, and the short-link resolver

## Status

The foundation is in place: local storage, sync, capture, and the visit log. The decision mode, faceted cuisine filtering, export/PWA, and the visible sync-status indicator are planned next — see [docs/plans/](docs/plans/) and [docs/brainstorms/](docs/brainstorms/).
