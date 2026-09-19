---
title: A PocketBase update rule checks the stored record, so it cannot stop an owner rewrite
date: 2026-09-19
category: database-issues
module: pocketbase / pb_migrations
problem_type: bug
component: database
severity: medium
related_components:
  - pocketbase
  - sync
applies_when:
  - Writing an `updateRule` on a per-user collection
  - Reviewing whether `owner = @request.auth.id` is enough
  - Enabling MFA/OTP on `_superusers` on an instance whose mailer is not configured
tags:
  - pocketbase
  - api-rules
  - authorization
  - ownership
  - mfa
  - otp
---

# A PocketBase update rule checks the stored record, so it cannot stop an owner rewrite

Verified against PocketBase **0.39.3**, the version `docker/Dockerfile.pocketbase` pins, on a
container built from this tree.

## Context

`pb_migrations/1718200000_init_collections.js` gave `restaurants` and `visits` the same rule on
all five operations: `owner = @request.auth.id`. It reads as "a user may only touch their own
records", and for list, view, create and delete it is exactly that.

## The finding

An **update** rule is evaluated against the record **as it is stored**, before the write is
applied. It answers "may this caller touch this record" and says nothing about what the payload
contains. So the rule admitted a caller editing their own record — and then let that same payload
set `owner` to somebody else's id.

Measured on a running instance, as user `alice` on a restaurant she owns:

| Request | Before | After |
|---|---|---|
| `PATCH {"owner": "<bob's id>"}` | `200` — record moves to bob | `404` |
| `PATCH {"note": "…"}` | `200` | `200` |
| `PATCH {"owner": "<alice's id>", "note": "…"}` | `200` | `200` |

The third row is not incidental: the sync engine sets `owner` on every push (U4), so a rule that
simply forbade `owner` in the body would have broken normal syncing.

The user-visible damage of the first row is two-sided — the victim sees restaurants and visits
appear in their account that they never created, and the author loses them, with no trace of who
moved them.

## The rule

**An update rule that guards a field must read `@request.body`, not the field.** The form now in
`pb_migrations/1789808400_pin_owner_on_update.js`:

```
@request.auth.id != "" && owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)
```

`:isset` is false when the field is absent from the payload, which is what keeps the "unchanged
owner" case working without special-casing it. A rule failure surfaces as `404`, not `403` —
PocketBase does not distinguish "no such record" from "not yours", so do not look for a `403` when
testing one.

## Side finding — MFA on `_superusers` needs an escape hatch, and has one

`pb_migrations/1789808500_superusers_enable_mfa_otp.js` turns on MFA + OTP for the superuser
account, as [PocketBase recommends for production](https://pocketbase.io/docs/going-to-production).
The obvious worry is a lockout: the second factor arrives by email, and an instance whose mailer is
not configured cannot send it.

Both halves were checked on the container:

- `POST /api/collections/_superusers/auth-with-password` with correct credentials returns
  `401 {"mfaId":"…"}` instead of a token — the factor is genuinely enforced.
- `pocketbase superuser otp --dir=/pb/pb_data <email>` prints the code on stdout, bypassing the
  mailer entirely, and `auth-with-otp?mfaId=…` then returns a session.

`--dir` is the part that is easy to miss: `docker compose exec` bypasses the image's `CMD`, and
without it the CLI opens a fresh database next to the binary instead of the mounted volume, then
reports the superuser does not exist.

The first claim of a fresh instance is unaffected — the installer link authenticates directly —
which is why `docs/how-to/deployment.md` puts "configure Settings → Mail" in that first session.
