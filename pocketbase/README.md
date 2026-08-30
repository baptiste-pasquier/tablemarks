# PocketBase backend

PocketBase is the optional cloud mirror. The app is fully usable without it (local-only mode); this backend powers Google sign-in and cross-device sync.

## Run locally

```bash
# Download the v0.26.x binary for your platform from https://pocketbase.io/docs/
# place it at pocketbase/pocketbase, then:
cd pocketbase
./pocketbase serve
```

`pb_migrations/` auto-applies on first `serve`, creating the `restaurants` and `visits` collections. `pb_hooks/` loads the short-link resolver route. Admin UI is at `http://127.0.0.1:8090/_/`.

Point the app at the instance with `VITE_PB_URL` (defaults to `http://127.0.0.1:8090`).

## Google OAuth2

In the admin UI: **Collections → users → Settings → OAuth2 → enable Google**, paste a Client ID + Secret from Google Cloud Console. Local-dev redirect URI: `http://127.0.0.1:8090/api/oauth2-redirect`.

## Collections

Both collections are per-user (every record relates to an `owner`; collection rules scope reads/writes to `owner = @request.auth.id`).

**restaurants** — `name`, `lat`, `lng`, `address`, `mapsUrl`, `cuisine`, `note`, `added`, `pending`, `latestVerdict`, `latestVisitDate`, `visitCount`, `syncedAt`, `deleted`.

**visits** — `restaurant` (relation), `date`, `verdict`, `note`, `syncedAt`, `deleted`; indexed on `restaurant`.

### Local ↔ remote field mapping

The client model and the PocketBase schema differ in three places; the sync engine (U4) maps between them:

| Local (IndexedDB) | Remote (PocketBase) | Why |
|---|---|---|
| `updated` | `syncedAt` | PocketBase reserves `updated` as a system autodate field it overwrites on save; the last-write-wins key must be a client-controlled field. |
| `restaurantId` (on visits) | `restaurant` (relation) | PocketBase models the link as a relation field. |
| — | `owner` | Set on push to the signed-in user; absent locally (no-account mode has no owner). |

The client-generated `id` (15-char `[a-z0-9]`) is reused as the PocketBase record `id`, so the same record reconciles by id across devices.

## Short-link resolver hook

`pb_hooks/resolveShortLink.pb.js` adds `GET /api/tablemarks/resolve-short-link?url=...`, which follows a `maps.app.goo.gl` redirect server-side and returns `{lat, lng, name?}`. It is public (no auth) so capture works in local-only mode.

> The `$http` / router API is PocketBase-version-specific. Verify the hook against the running binary's generated `pb_data/types.d.ts` if your version differs from v0.26.
