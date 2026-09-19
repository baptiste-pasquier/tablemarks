/// <reference path="../pb_data/types.d.ts" />

// Pins `owner` on update for `restaurants` and `visits`.
//
// The rule installed by pb_migrations/1718200000_init_collections.js was
// `owner = @request.auth.id`. An update rule is evaluated against the record as it
// is *before* the write, so it only answers "may this caller touch this record" —
// it says nothing about what the body may contain. Nothing stopped an authenticated
// caller from PATCHing `{"owner": "<someone else's id>"}` onto a record they own and
// moving it into another account: the victim sees entries they never created, the
// author loses them.
//
// The added clause reads the submitted body instead of the stored record:
// `@request.body.owner:isset` is false when the field is absent from the payload
// (the normal sync push), and when it is present it must equal the caller's own id.
// The leading `@request.auth.id != ""` keeps an unauthenticated caller out explicitly
// rather than relying on `owner` never being the empty string.
//
// Create and delete are unaffected: a create rule *is* evaluated against the
// submitted record, so `owner = @request.auth.id` already rejects a foreign owner there.
//
// Measured before and after, on a running 0.39.3 container:
// docs/journal/solutions/database-issues/pocketbase-update-rules-do-not-see-the-request-body.md.
//
// Every value used here is declared inside the callbacks, matching the rest of
// pb_migrations/ — see docs/journal/solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md.

migrate(
  (app) => {
    for (const name of ['restaurants', 'visits']) {
      const collection = app.findCollectionByNameOrId(name)
      collection.updateRule =
        '@request.auth.id != "" && owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)'
      app.save(collection)
    }
  },
  (app) => {
    for (const name of ['restaurants', 'visits']) {
      const collection = app.findCollectionByNameOrId(name)
      collection.updateRule = 'owner = @request.auth.id'
      app.save(collection)
    }
  },
)
