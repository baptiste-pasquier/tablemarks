type Listener = () => void

const listeners = new Set<Listener>()

/** Subscribe to local data mutations (user-driven writes). Returns an unsubscribe fn. */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Fired by repositories after a user-driven create/update/delete (not after sync writes). */
export function emitLocalChange(): void {
  for (const fn of listeners) fn()
}
