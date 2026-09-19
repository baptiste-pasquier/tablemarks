/// <reference path="../pb_data/types.d.ts" />

// Requires a second factor on the `_superusers` collection: a password alone no longer
// authenticates the account that can read and rewrite every record in the instance.
// With MFA on, PocketBase answers a successful password login with an `mfaId` instead
// of a token, and the session only opens once a second method completes — here an
// email one-time code, which is what `otp` enables. PocketBase recommends exactly this
// for a production instance (https://pocketbase.io/docs/going-to-production).
//
// This is only worth having if the instance can send mail, and the escape hatch when it
// cannot is a shell on the host: `pocketbase superuser otp <email>` prints a code
// without going through the mailer. The first claim of a fresh instance is unaffected —
// the installer link authenticates directly — so this does not change the bring-up
// sequence in docs/how-to/deployment.md.
//
// Both halves checked on a running container:
// docs/journal/solutions/database-issues/pocketbase-update-rules-do-not-see-the-request-body.md.
//
// `unmarshal` is the documented way to set a nested collection option; assigning to
// `collection.mfa.enabled` writes to a copy of the struct and is silently lost.

migrate(
  (app) => {
    const superusers = app.findCollectionByNameOrId('_superusers')

    unmarshal({ mfa: { enabled: true }, otp: { enabled: true } }, superusers)

    app.save(superusers)
  },
  (app) => {
    const superusers = app.findCollectionByNameOrId('_superusers')

    unmarshal({ mfa: { enabled: false }, otp: { enabled: false } }, superusers)

    app.save(superusers)
  },
)
