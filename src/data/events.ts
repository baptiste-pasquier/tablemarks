type Listener = () => void

// Two channels:
//  - localChange: user-driven writes only. The sync controller listens here to push.
//  - storeChange: ANY write (user or sync-pulled). The UI listens here to refresh.
// Splitting them keeps sync writes from re-triggering a push loop while still
// refreshing the UI when remote changes land.
const localListeners = new Set<Listener>()
const storeListeners = new Set<Listener>()

/** Subscribe to user-driven mutations (the sync push trigger). */
export function onLocalChange(fn: Listener): () => void {
  localListeners.add(fn)
  return () => localListeners.delete(fn)
}

/** Subscribe to any store mutation, user or sync-pulled (the UI refresh trigger). */
export function onStoreChange(fn: Listener): () => void {
  storeListeners.add(fn)
  return () => storeListeners.delete(fn)
}

/** Fired by repositories after a user-driven create/update/delete. Implies a store change too. */
export function emitLocalChange(): void {
  for (const fn of localListeners) fn()
  for (const fn of storeListeners) fn()
}

/** Fired after a sync-pulled write — refreshes the UI without re-triggering a push. */
export function emitStoreChange(): void {
  for (const fn of storeListeners) fn()
}
