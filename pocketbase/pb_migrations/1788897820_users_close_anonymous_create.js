/// <reference path="../pb_data/types.d.ts" />

// Close anonymous account creation on the `users` collection — without closing the account
// creation that the operator's first Google sign-in performs (R27).
//
// Why this is a migration and not a documented console step: deployment topology and credentials
// (the public origin, the trusted proxy header, the rate limiter, the OAuth client secret) depend
// on the host and stay operator steps. A collection access rule does not describe the host — it
// describes the collection, which is schema, and schema lives here (KD5).
//
// The problem it fixes: the initial migration never touched `users`, so its rules are the
// PocketBase defaults, and the default create rule is the **empty string** — which means "anyone",
// unauthenticated callers included. On localhost that is inert. On a public origin it is an open
// write endpoint on a single-operator instance: a stranger can POST /api/collections/users/records
// and get an account.
//
// The trap: PocketBase creates the OAuth2 account by *replaying the record-create API internally*
// (apis.sendOAuth2RecordCreateRequest posts to /api/collections/users/records), so the create rule
// is evaluated for it too. The caller is unauthenticated at that moment — it is a first sign-in —
// so any rule phrased as "must already be signed in", and equally a locked rule (null, "superusers
// only"), bricks the only sign-in path on a clean instance.
//
// What separates the two: PocketBase tags that internal request with the OAuth2 request context
// (core.RequestInfoContextOAuth2), which rules read as `@request.context`. A plain API call carries
// the "default" context. So the rule admits exactly the OAuth2 sign-up path and nothing else.
//
// Verified on PocketBase 0.39.3 against a running container: an anonymous POST is refused with 403
// while a first-ever sign-in through an OAuth2 provider still creates its user record.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    users.createRule = '@request.context = "oauth2"'

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    // Back to the PocketBase default: an empty (not null) rule, i.e. open to everyone.
    users.createRule = ''

    app.save(users)
  },
)
