---
title: Deployment
type: how-to
audience: [human, agent]
status: stable
stale_after: 2027-06-01
---

# Deployment

One source tree, two targets.

| Target | What runs | Backend |
|---|---|---|
| **Private stack** | Two containers on your own host — the app image and the PocketBase image — brought up with `docker/docker-compose.prod.yml` | PocketBase, over the URL you configure |
| **Public demo** | The static build published to GitHub Pages at <https://baptiste-pasquier.github.io/tablemarks/> | None. `config.json` ships an empty URL, and the app runs local-only |

The app reads its backend location at runtime from a served `config.json`, so **one image serves
any deployment** — see [ADR-0001](../journal/decisions/0001-read-the-backend-location-at-runtime.md).

## Bring up a new private instance

The steps below are an **ordered sequence**. Three of the orderings are load-bearing and are called
out where they apply.

1. **Start the stack with PocketBase reachable only over loopback or an SSH tunnel.** Do not point
   the public route at it yet.

   ```bash
   TABLEMARKS_IMAGE_TAG=<commit-sha> docker compose -f docker/docker-compose.prod.yml up -d
   ```

2. **Claim the superuser account**, over that private path, at `/_/`.

   A fresh PocketBase answers its first caller with an **unauthenticated installer screen**. The
   window between first boot and first claim is however long the operator takes, and whoever
   reaches the installer first owns the instance. Claiming over a private path closes the window
   before anyone else can be in it. This is why step 1 keeps the public route shut.

3. **Set the trusted proxy header.** Console → **Settings → Application → Proxy**: header
   `X-Forwarded-For`, selection **rightmost**.

   Rightmost is the only value a client cannot forge: a visitor can send any `X-Forwarded-For`
   they like, and your proxy appends the real address at the end of the list.

4. **Enable the rate limiter.** Console → **Settings → Application → Rate limiting**.

   Step 3 comes before step 4. A limiter that runs while PocketBase still sees only the proxy's
   own address puts **every visitor in one bucket**: the first busy client exhausts the quota and
   the instance rate-limits everybody, including itself.

5. **Enable the Google auth provider.** Console → **Collections → users → Options → OAuth2**,
   enable Google, paste the Client ID and Client Secret from Google Cloud Console.

6. **Register the deployed origin as a redirect URI on the Google side**, last:
   `https://<your-pocketbase-origin>/api/oauth2-redirect`. Google rejects any callback to an
   origin not listed here, so this is the step that makes sign-in work rather than a formality.

7. **Sign in once yourself**, over that same private path, before the route is public.

   Read [First sign-in on a private instance](#first-sign-in-on-a-private-instance) first — it is
   a reconciliation event, and the export it asks for is the only copy of the pre-merge state.

   This step comes before step 8 and cannot be skipped: step 8 closes the door that creates your
   account, so your record has to exist before it shuts.

8. **Close account creation.** Console → **Collections → users → API Rules → Create rule**, set to
   **superusers only** (the lock).

   `pb_migrations/1788897820_users_close_anonymous_create.js` already closed *anonymous* creation,
   but the rule it installs gates on the sign-in *mechanism*, not on identity: every Google account
   on the internet satisfies `@request.context = "oauth2"`. Without this step, opening the route in
   step 9 lets any stranger click **Sign in with Google** and get an account on your instance, with
   write access to their own records.

   Locking the rule does not affect *your* sign-in: signing in to an account that already exists is
   an authentication, not a create. It blocks only new accounts — so if you ever need to add one,
   unlock the rule, sign in with that account, and lock it again.

   Step 8 comes after step 7 for the same reason, from the other side: on an instance where no user
   record exists yet, a locked create rule leaves no way in at all.

9. **Open the public route** to the stack.

### All of this lives in `pb_data`

Every setting in steps 2 to 5, and the locked create rule from step 8, is stored in the `pb_data`
volume — not in the image and not in an environment variable. Three consequences follow.

| Consequence | What it means |
|---|---|
| The volume holds secrets | The OAuth **client secret** and PocketBase's **token signing keys** are in it, alongside restaurant data |
| Destroying the volume destroys the hardening | Every one of these settings is gone, and the instance returns to an unclaimed installer screen |
| A backup of the volume is a copy of those secrets | It is not a data-only archive, and must be handled as a secret rather than as a database dump |

## Roll back a bad release

Set the shared tag variable to a previous commit SHA and bring the stack back up:

```bash
TABLEMARKS_IMAGE_TAG=<previous-commit-sha> docker compose -f docker/docker-compose.prod.yml up -d
```

The two containers do **not** roll back symmetrically, and the asymmetry decides what a rollback
can fix.

| Container | Rolls back cleanly? | Why |
|---|---|---|
| App | Yes | It is stateless. The older image serves the older assets and reads the same `config.json` |
| PocketBase | **No** | Pulling an older image does not un-apply a migration already recorded in the volume |

A schema change is therefore not recoverable by rolling the tag back. **Schema recovery is
restore-from-backup**, and nothing else.

## Upgrade

1. **Take a PocketBase backup first.** Console → **Settings → Backups → Initialize new backup**.

   The backup **is a copy of the volume**. It carries the OAuth client secret and the token
   signing keys, not restaurant data alone.

   PocketBase writes it **inside the volume it is meant to protect**. That makes it useless
   against volume loss, and it puts an archive of your secrets next to the secrets. **Download it
   off the host** and store it where a secret belongs — the same place as the OAuth client secret,
   not next to a code checkout.

2. **Move the tag forward** for both images at once:

   ```bash
   TABLEMARKS_IMAGE_TAG=<new-commit-sha> docker compose -f docker/docker-compose.prod.yml pull
   TABLEMARKS_IMAGE_TAG=<new-commit-sha> docker compose -f docker/docker-compose.prod.yml up -d
   ```

3. **Check the result in the console, with no SQL.** Open **Collections → restaurants** and
   **Collections → visits** and confirm two things:

   - the **record count** matches what it was before the upgrade;
   - **no record shows a blank timestamp where one was populated** — filter `syncedAt = ""` in the
     collection's filter box and expect zero rows.

   A blank `syncedAt` on records that had one is the signature of a field retype during migration;
   the mechanism and its guard are in
   [`../journal/solutions/database-issues/guard-empty-syncedat-after-pocketbase-field-retype.md`](../journal/solutions/database-issues/guard-empty-syncedat-after-pocketbase-field-retype.md).

## After a restore

**Re-verify the console settings in steps 2 to 5 and step 8, do not assume them.** A restore
returns the instance to whatever hardening the backup captured — which may be a state from before
the proxy header, the limiter, the OAuth credentials or the locked create rule were set. Walk the
sequence again and confirm each value.

**Step 8 is the one whose absence is silent.** A missing proxy header or limiter degrades something
you can observe; a create rule restored to its unlocked state changes nothing you can see from the
app, and simply lets the next stranger sign up. Check it explicitly rather than by symptom.

The same applies to reverting the migration. Its `down` restores the PocketBase default, an empty
create rule open to unauthenticated callers — so `migrate down` past it on a public instance
reopens more than step 8 closed. There is no reason to run it on a live instance; recovery is
restore-from-backup.

## First sign-in on a private instance

**Export the local data before signing in for the first time.** Use the app's own export, from the
account menu.

First sign-in is a **reconciliation event**, not an upload: it merges the browser's existing
records with whatever the account already holds, by id and by last-write-wins. An export taken
beforehand is the only copy of the pre-merge state.

## One-time manual steps in GitHub

Two settings cannot be set from a workflow file. Both fail visibly and both are fixed by changing
the setting and re-running the workflow — never by editing a workflow.

| Setting | Symptom if skipped | Fix |
|---|---|---|
| Pages source | The first Pages deploy fails | **Settings → Pages → Source → GitHub Actions**, then re-run the workflow |
| Package visibility | The published images are private, so `docker compose pull` on the host cannot reach them | Make each package public from its page under the account's **Packages**, then re-run the pull |

## Monitoring

**One external HTTP check against the public app URL is the whole monitoring story.** Point an
uptime checker at the app's `/healthz`.

That check proves the **app** is up. It does not prove the backend is answering: the app serves its
shell and its health endpoint whether or not PocketBase is reachable, by design. A visitor
discovers a dead backend as a sign-in that does not complete, and the check stays green.

## The demo's third-party dependencies

The public demo has no backend of its own, and it reaches two third parties directly from the
visitor's browser.

| Host | What it receives | What breaks if it is blocked or down |
|---|---|---|
| `nominatim.openstreetmap.org` | The visitor's **search text**, and reverse-geocode lookups for coordinates | **Name search**, entirely |
| `tile.openstreetmap.org` | The visitor's **map viewport** — which areas they are looking at | Map tiles; already-cached areas still render |

**Neither has a fallback provider.**

A blocked geocoder is the demo's **single point of failure for its own success criterion**. The
demo has no backend, so short links are already refused; name search is the remaining low-friction
way to add a place, and losing it leaves only the paste-a-full-Maps-URL path. Name this when
handing the demo to someone, rather than letting them discover it.

Short links (`maps.app.goo.gl`) are refused on the demo because resolving one needs a server. The
app says so on the capture surface and names the two paths that still work: type the place name,
or paste the full Maps URL from the address bar.

## Configuration reference

Set in `docker/.env` (copy `docker/.env.example`). Compose reads that file automatically, because
the project directory is the directory of the first `-f` file.

| Variable | Default | What it is |
|---|---|---|
| `TABLEMARKS_POCKETBASE_URL` | none in `docker-compose.prod.yml`; the deploy stops without it | The URL the **browser** uses to reach PocketBase |
| `TABLEMARKS_IMAGE_TAG` | none; the deploy stops without it | The single commit SHA **both** images are addressed by |
| `TABLEMARKS_IMAGE_REPOSITORY` | `ghcr.io/baptiste-pasquier` | The registry namespace both images are pulled from |
| `TABLEMARKS_APP_PORT` | `8080` | Host-side port for the app container (container port 80) |
| `TABLEMARKS_POCKETBASE_PORT` | `8090` | Host-side port for the PocketBase container (container port 8090) |

`TABLEMARKS_APP_PORT` and `TABLEMARKS_POCKETBASE_PORT` are read only by the two Compose files;
`docker/.env.example` does not list them. **Changing the PocketBase port means changing
`TABLEMARKS_POCKETBASE_URL` to match** — the browser reaches the published host port, not the
container's.

### `TABLEMARKS_POCKETBASE_URL` in detail

- It is the URL the **browser** uses, **not a Compose service name**. `http://pocketbase:8090`
  resolves only inside the Compose network and fails from a phone.
- It is **public**. The entrypoint writes it verbatim into a world-readable `/config.json` and into
  the app's Content-Security-Policy. **No secret may go in it.**
- The container **refuses to boot** on a value that is not a plain `http(s)` URL, on a
  non-loopback `http://` URL, or on a value containing quotes, spaces, semicolons or backslashes.
- Leaving it empty is a valid state, not an error: the app then runs local-only.

### `TABLEMARKS_IMAGE_TAG` in detail

Both images are published under the same commit SHA and both Compose services read this one
variable, so **the app and PocketBase cannot be rolled forward separately**. A new app talking to
an old PocketBase is a bug nobody can reproduce, and a single shared tag is what makes that state
unreachable. The variable has no default on purpose: an unset tag stops the deploy rather than
resurrecting whatever a floating tag points at today.

## The PocketBase image depends on `curl` at runtime

`curl` is a **load-bearing dependency** of the PocketBase image, not a convenience. The
short-link resolver hook shells out to it because it needs an HTTP client that does *not* follow
redirects, and PocketBase's own `$http.send` always does.

Removing `curl` from the image makes the resolver **fail closed**: the route returns `502`, and
capture falls back to the search and full-URL paths. The mechanism and the verification are in
[`../journal/solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md`](../journal/solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md).

## Related

- [`development.md`](development.md) — local setup and the local PocketBase
- [`../explanation/architecture.md`](../explanation/architecture.md) — why the backend is optional
- [`../../pocketbase/README.md`](../../pocketbase/README.md) — collections, OAuth, the resolver hook
