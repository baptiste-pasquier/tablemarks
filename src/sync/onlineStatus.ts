/**
 * Shared online/offline detection. Consolidates the browser connectivity APIs behind one
 * seam so consumers (later units: `syncEngine.ts`, `resolvePending.ts`) stop each reading
 * `navigator.onLine` and adding their own `window` 'online' listener independently.
 */

/** Current browser-reported connectivity. */
export function isOnline(): boolean {
  return navigator.onLine
}

type Listener = () => void

/**
 * Subscribe to browser online/offline transitions. Fires `cb` on both the `'online'` and
 * `'offline'` window events; callers that only care about one direction can call `isOnline()`
 * inside `cb` to check current state. Returns an unsubscribe function, matching the
 * subscribe/unsubscribe shape used in `src/data/events.ts`.
 */
export function onOnlineChange(cb: Listener): () => void {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
