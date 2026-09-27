# PocketBase backend

PocketBase is the optional cloud mirror. The app is fully usable without it (local-only mode); this backend powers Google sign-in and cross-device sync.

## Run locally

```bash
# Download the v0.39.3 binary for your platform from https://pocketbase.io/docs/
# (the version docker/Dockerfile.pocketbase pins, so local matches the deployed image)
# place it at pocketbase/pocketbase, then:
cd pocketbase
./pocketbase serve
```

`pb_migrations/` auto-applies on first `serve`, creating the `restaurants` and `visits` collections. `pb_hooks/` loads the short-link resolver route. Admin UI is at `http://127.0.0.1:8090/_/`.

Point the app at the instance by editing `public/config.json`:

```json
{ "pocketbaseUrl": "http://127.0.0.1:8090" }
```

The app reads its backend location from this served file at runtime, so one build runs against any
instance — see [ADR-0001](../docs/journal/decisions/0001-read-the-backend-location-at-runtime.md).
The committed value is the empty string, which means "no backend": a plain `npm run dev` has no
sign-in, no sync, and refuses short links. Keep your local edit out of your commits.

## Google OAuth2

The OAuth2 auth method on `users` is on already — `pb_migrations/1789808600_users_enable_oauth2.js` enables it, since it is the only sign-in path the app offers. What stays a console step is the credential: **Collections → users → Settings → OAuth2 → enable Google**, paste a Client ID + Secret from Google Cloud Console. Local-dev redirect URI: `http://127.0.0.1:8090/api/oauth2-redirect`.

Superuser login asks for a second factor: `pb_migrations/1789808500_superusers_enable_mfa_otp.js` turns on MFA + OTP on `_superusers`, so a password gets you an emailed code prompt rather than a session. On an instance with no working mailer, `./pocketbase superuser otp <email>` prints the code instead.

For a public instance the console steps are ordered, and the order matters — claim the superuser over a private path before opening the public route, and set the trusted proxy header before enabling the rate limiter. The full sequence is in [`docs/how-to/deployment.md`](../docs/how-to/deployment.md).

## Collections

Both collections are per-user (every record relates to an `owner`; collection rules scope reads/writes to `owner = @request.auth.id`). The **update** rule carries one more clause, because an update rule is checked against the stored record and would otherwise let a caller rewrite `owner` in the request body and hand their record to another account:

```
@request.auth.id != "" && owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)
```

Why, with the measurements: [`docs/journal/solutions/database-issues/pocketbase-update-rules-do-not-see-the-request-body.md`](../docs/journal/solutions/database-issues/pocketbase-update-rules-do-not-see-the-request-body.md).

**restaurants** — `name`, `lat`, `lng`, `address`, `mapsUrl`, `cuisine`, `note`, `added`, `pending`, `osm`, `latestVerdict`, `latestVisitDate`, `visitCount`, `syncedAt`, `deleted`.

**visits** — `restaurant` (relation), `date`, `verdict`, `note`, `syncedAt`, `deleted`; indexed on `restaurant`.

### Local ↔ remote field mapping

The client model and the PocketBase schema differ in three places; the sync engine (U4) maps between them:

| Local (IndexedDB)          | Remote (PocketBase)     | Why                                                                                                                                        |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `updated`                  | `syncedAt`              | PocketBase reserves `updated` as a system autodate field it overwrites on save; the last-write-wins key must be a client-controlled field. |
| `restaurantId` (on visits) | `restaurant` (relation) | PocketBase models the link as a relation field.                                                                                            |
| —                          | `owner`                 | Set on push to the signed-in user; absent locally (no-account mode has no owner).                                                          |

The client-generated `id` (15-char `[a-z0-9]`) is reused as the PocketBase record `id`, so the same record reconciles by id across devices.

## Short-link resolver hook

`pb_hooks/resolveShortLink.pb.js` adds `GET /api/tablemarks/resolve-short-link?url=...`, which reads a `maps.app.goo.gl` redirect server-side and returns `{lat, lng, name?}`. It requires authentication: answering an anonymous caller forks a `curl` process per hit, which is a denial-of-service lever once the instance is internet-exposed. A short link pasted while signed out saves a provisional record instead, and the client retries it on sign-in.

Two rules govern any edit to this file, both verified against a running PocketBase 0.39.3:

1. **Everything a hook handler uses is declared inside the handler.** PocketBase runs each handler in an isolated goja VM with no access to file-level scope; a constant or helper declared at the top of the file raises `ReferenceError`, which PocketBase reports to the caller as a generic `400`.
2. **Do not use `$http.send` to inspect a redirect.** It follows redirects and exposes no final URL — its documented options are `url`, `method`, `body`, `data`, `headers` and `timeout`, with no redirect control. The hook shells out to `curl` with `--max-redirs 0` instead, which makes `curl` a load-bearing runtime dependency of the PocketBase image — remove it and the resolver fails closed.

Both, with the evidence: [`docs/journal/solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md`](../docs/journal/solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md).

> The `$http` / router API is PocketBase-version-specific. Verify the hook against the running binary's generated `pb_data/types.d.ts` if your version differs from 0.39.3.
