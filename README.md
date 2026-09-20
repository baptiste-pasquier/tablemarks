# Tablemarks

Save your favorite and to-try restaurants on a map. Tablemarks is **local-first**: it works fully in your browser with no account, and signing in with Google backs up and syncs your places across devices.

- Paste a Google Maps link (or search by name) to add a place in seconds
- Track visits with a simple returnability verdict — _Go back · Worth a detour · Once was enough · Never again_
- Filter by cuisine and status, all on a map
- Your data lives in your browser; the cloud is an optional mirror

## Try it

**[Live demo →](https://baptiste-pasquier.github.io/tablemarks/)**

The demo runs with no backend, so there is no sign-in and no sync — and short `maps.app.goo.gl` links, which need a server to resolve, are refused. Search by name or paste a full Google Maps link instead. Everything else works, and your data stays in your browser.

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

This starts the app with **no backend**, the same as the demo. To enable Google sign-in and sync, run a PocketBase instance alongside the app and point `public/config.json` at it — see [docs/how-to/development.md](docs/how-to/development.md#optional-pocketbase-backend) and [pocketbase/README.md](pocketbase/README.md).

## Usage

- **Add a place:** click _+ Add a place_, paste a Google Maps link or type a name, and save.
- **Log a visit:** open a place and tap _I'm here now_, then pick a verdict.
- **Sign in (optional):** use _Sign in with Google_ to back up and sync; signing out keeps your local data.

## Scripts

| Command              | What it does                        |
| -------------------- | ----------------------------------- |
| `npm run dev`        | Start the dev server                |
| `npm test`           | Run the test suite                  |
| `npm run build`      | Type-check and build for production |
| `npm run type-check` | Type-check only                     |
| `npm run lint`       | Lint and auto-fix                   |
| `npm run format`     | Format with Prettier                |

## Documentation

- [Architecture](docs/explanation/architecture.md) — the local-first design, sync, and offline behavior
- [Data model](docs/reference/data-model.md) — record shapes, verdicts, the rollup, and local↔remote mapping
- [Development](docs/how-to/development.md) — setup, project structure, testing, and PocketBase
- [Deployment](docs/how-to/deployment.md) — running your own instance, upgrades, and recovery
- [PocketBase backend](pocketbase/README.md) — collections, Google OAuth, and the short-link resolver

See [docs/README.md](docs/README.md) for the full documentation map.

## Status

Local storage, sync, capture, the visit log, the decision mode, faceted cuisine filtering, data export/import, the installable PWA, and the sync-status indicator are all in place — see [docs/journal/plans/](docs/journal/plans/) and [docs/journal/ideation/](docs/journal/ideation/) for the implementation history.
