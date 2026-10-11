---
status: "accepted"
date: 2026-10-11
decision-makers: [Baptiste Pasquier]
---

# Bind the local store to one account and erase it on sign-out

## Context and Problem Statement

The IndexedDB store had no notion of an owner, and every sign-in ran the union reconcile against it. Measured on PocketBase 0.39.3
([`account-switch-wedges-sync-on-shared-local-store.md`](../solutions/database-issues/account-switch-wedges-sync-on-shared-local-store.md)),
a second account signing in on the same device had its sync wedged on a `400` after part of the first account's unsynced places leaked into it. The first account's places also stayed visible after sign-out, and both accounts' places mixed in the local view.

The affected components are `src/data/` (the store), `src/auth/` (sign-in, sign-out, startup) and `src/features/account/` (the questions put to the user). One browser profile must serve one account and several people taking turns, without giving up local-first.

## Decision Drivers

* A store must never merge two accounts' places.
* A user's unsent changes must not be lost silently.
* No code refreshes the PocketBase token, so a session can expire without any sign-out.
* A store created before this decision holds data with no recorded owner.

## Considered Options

* A `meta` object store in IndexedDB holding the owner
* A `localStorage` key holding the owner
* An owner field on every record, partitioning the store per account

## Decision Outcome

Chosen: **a `meta` object store in IndexedDB** (`tablemarks` v2), holding the owner account id. The store belongs to one account, a user sign-out erases it, and a sign-in that finds data asks before merging or erasing.

The owner and the records live in one database, so an erase clears both in one transaction and they cannot disagree. The v1 to v2 upgrade creates the store and marks an existing database `legacy`; it opens with no owner. Binding or erasing the store removes the marker.

| Situation | Outcome |
|---|---|
| Sign-in, same owner | Sync |
| Sign-in, no owner, no live places | Bind and sync |
| Sign-in, no owner, live places | Ask: add them to the account, erase them, or cancel |
| Sign-in, another owner | Ask: erase and continue, or cancel |
| Startup, valid session, same owner | Sync |
| Startup, valid session, no owner, no live places | Bind silently and sync |
| Startup, valid session, no owner, legacy store (live places or not) | Bind silently and sync |
| Startup, valid session, no owner, live places, store created after the upgrade | End the session without erasing; the next sign-in asks |
| Startup, valid session, another owner | End the session without erasing |
| Expired session, or automatic sign-out on a build with no backend | Never erase; the store stays bound |

Cancel at a sign-in question ends the session and leaves the store untouched. Any failure during startup ends the session.

User sign-out tries to send pending changes, bounded at 10 s, and asks before losing unsent ones. It then stops sync, waits for any in-flight sync to finish (bounded at 10 s), clears the session and erases the store. If the wait or the erase fails, the session is cleared, the store is kept and still bound to its owner, and the user sees an alert with Try again.

Sign-in first stops and settles any sync still running, for example after an in-tab token expiry, so the owner check never races a live sync.

An erase emits a store change after the transaction commits and never a local change, so it never triggers a push.

### Deviation from the design spec

The design spec bound an ownerless store with places silently at startup. This decision keeps that only for a pre-existing store, one upgraded from v1, which the app was already syncing with the session it finds; binding it silently keeps an upgrade from signing every signed-in user out. An ownerless store created after the upgrade ends the session instead, so the next sign-in asks. A reload during the add-or-erase question would otherwise have merged someone else's places into the account without a prompt.

### Consequences

* Good: two accounts never share a store, so the `400` wedge and the leak cannot occur through the app.
* Good: a shared device shows no previous user's places after sign-out.
* Good: every sign-in outcome is a single decision on the owner and the live-place count.
* Bad: signing out loses changes that could not be sent; the user is warned first and can cancel.
* Bad: both bounded waits can expire, and a failed erase leaves the data on the device until the user retries.
* Bad: a user whose session ended at startup on an ownerless store created after the upgrade must sign in again to be asked.
* Out of scope: tabs are not serialized, so two tabs can run a sign-in and a sign-out at once. A tab stops its sync when its session changes and resumes it once the store belongs to its account again; every write, erase or bind refreshes the other tabs.
* Out of scope: a pre-existing ownerless store adopted by the wrong account still wedges once, as before. The service worker's tile cache and the `localStorage` preferences are not erased.

### Confirmation

`src/auth/auth.test.ts` covers every row above, including a regression where a fake remote refuses another account's id as PocketBase does. `src/data/storeOwner.test.ts` covers the v1 to v2 upgrade and the erase.

## Pros and Cons of the Options

### `meta` object store in IndexedDB

* Good, because the owner and the records are erased in one transaction.
* Bad, because it needs a schema version bump.

### `localStorage` key

* Good, because it needs no schema change.
* Bad, because an erase cannot be atomic with the records, so a failure between the two leaves an owner that disagrees with the store.

### Owner field on every record

* Good, because several accounts could keep data on one device.
* Bad, because every read and write filters by owner, and a sign-out would still have to erase or hide the rest.
