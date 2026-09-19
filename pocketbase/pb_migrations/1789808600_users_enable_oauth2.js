/// <reference path="../pb_data/types.d.ts" />

// Turns on the OAuth2 auth method for `users`. It is off in a default PocketBase
// collection, and it is the only sign-in path this app offers — the client calls
// `authWithOAuth2` and nothing else (src/auth/auth.ts).
//
// The flag is the mechanism, not the provider: Google's client ID and secret are
// per-instance credentials and stay a console step (docs/how-to/deployment.md, step 5).
// Enabling OAuth2 with no provider configured is inert.
//
// It belongs in a migration for the same reason the create rule does: which auth
// methods a collection accepts describes the collection, not the host. See
// pb_migrations/1788897820_users_close_anonymous_create.js, whose
// `@request.context = "oauth2"` create rule presupposes this flag.
//
// `unmarshal` is the documented way to set a nested collection option; assigning to
// `collection.oauth2.enabled` writes to a copy of the struct and is silently lost.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    unmarshal({ oauth2: { enabled: true } }, users)

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    unmarshal({ oauth2: { enabled: false } }, users)

    app.save(users)
  },
)
