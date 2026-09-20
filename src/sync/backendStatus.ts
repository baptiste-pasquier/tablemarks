/**
 * Subscribable backend-availability store (KTD2): the one place the app reads to answer "does this
 * deployment have a backend, and is it answering?" Mirrors `syncStatus.ts` — a listener set, a
 * current value, an emit, a getter and a subscribe — because that is this repository's shape for
 * cross-cutting reactive state (`useSyncExternalStore`, no React context anywhere in `src/`).
 *
 * The two signals are held apart on purpose (KD3). **Presence** answers "is a backend part of this
 * build?" and resolves immediately from a local configuration file (`runtimeConfig.ts`).
 * **Reachability** answers "did it answer?" and resolves later, from a health check or a sync
 * attempt. Collapsing them into one boolean would make a configured instance that is down
 * indistinguishable from a deliberately backend-free build, which is exactly what the public demo
 * and the private container must never look like to each other.
 *
 * Writers: the bootstrap writes presence once from the resolved configuration, and seeds
 * reachability from a startup health check and on every browser online/offline transition. The
 * sync engine writes reachability from every attempt it actually makes, failures *and* successes —
 * a store with one writer and no clearer strands the header in a stale "unreachable" forever.
 *
 * "Actually makes" is the whole qualification. `SyncController` writes nothing when it
 * short-circuits offline, because it has sent no request and so learned nothing about the server.
 * And it classifies rather than blankets: a rejected credential proves the server answered, so
 * that failure reports *reachable*.
 */
import type { RuntimeConfig } from './runtimeConfig'

/**
 * Three outcomes, never two (KTD9). `unavailable` means the configuration itself could not be
 * read, so the *address* is unknown — it maps to configured-but-unreachable, never to `absent`,
 * but it is not interchangeable with a known address that is merely down either: consumers offer
 * sign-in disabled here and active for `configured`.
 */
export type BackendPresence = RuntimeConfig

/**
 * `unknown` is a first-class third state, not a placeholder for `reachable`. Presence resolves
 * immediately and reachability resolves later; during that window the app can support neither
 * claim, so consumers render no indicator at all.
 */
export type BackendReachability = 'unknown' | 'reachable' | 'unreachable'

export interface BackendStatus {
  readonly presence: BackendPresence
  readonly reachability: BackendReachability
}

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Before the bootstrap resolves the configuration file nothing is known — which is precisely
 * `unavailable`. Defaulting to `absent` would hide sign-in on a private instance for the life of
 * the tab; defaulting to `configured` would render a dead control on the public demo.
 */
let current: BackendStatus = {
  presence: { status: 'unavailable', reason: 'configuration not resolved yet' },
  reachability: 'unknown',
}

function emit(): void {
  for (const fn of listeners) fn()
}

/**
 * Current backend-availability snapshot. Identity only changes when a field does, so this is a
 * safe `useSyncExternalStore` snapshot and a safe effect dependency — a fresh object per read is
 * the silent render loop documented in
 * `docs/journal/solutions/conventions/react-leaflet-test-mock-stability.md`.
 */
export function getBackendStatus(): BackendStatus {
  return current
}

/** Subscribe to backend availability changes. Returns an unsubscribe function. */
export function onBackendStatusChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Records the resolved configuration. A reachability reading belongs to the address it was taken
 * against, so any change of presence resets reachability to `unknown` rather than carrying a
 * measurement forward onto a different (or no) backend.
 */
export function setBackendPresence(presence: BackendPresence): void {
  if (samePresence(presence, current.presence)) return
  current = { presence, reachability: 'unknown' }
  emit()
}

/**
 * Records whether the backend answered. `'reachable'` is the sync engine's success path clearing a
 * previous failure; `'unknown'` retracts the claim entirely.
 *
 * Ignored unless an address is actually known: a deployment with no backend has nothing to be
 * unreachable, and an unreadable configuration was never health-checked. That keeps the store to
 * exactly four admissible states — absent, configured-and-reachable, configured-and-unreachable,
 * and configured-with-no-known-address — and stops an absent backend from ever reading as a sync
 * problem.
 */
export function setBackendReachability(reachability: BackendReachability): void {
  if (current.presence.status !== 'configured') return
  if (reachability === current.reachability) return
  current = { ...current, reachability }
  emit()
}

/** True only for a deployment that deliberately ships without a backend (R4: no Sign in control). */
export function backendIsAbsent(status: BackendStatus): boolean {
  return status.presence.status === 'absent'
}

/** True when a backend URL is known, so sign-in can actually be attempted against it. */
export function backendAddressIsKnown(status: BackendStatus): boolean {
  return status.presence.status === 'configured'
}

/**
 * True when a backend belongs to this deployment but cannot be used right now (R6) — either its
 * address could not be read or a health check failed. Pair with `backendAddressIsKnown` to tell
 * those two apart; never true for `absent`, and never true while reachability is `unknown`.
 */
export function backendIsUnreachable(status: BackendStatus): boolean {
  if (status.presence.status === 'unavailable') return true
  return status.presence.status === 'configured' && status.reachability === 'unreachable'
}

function samePresence(a: BackendPresence, b: BackendPresence): boolean {
  if (a.status !== b.status) return false
  if (a.status === 'configured' && b.status === 'configured')
    return a.pocketbaseUrl === b.pocketbaseUrl
  if (a.status === 'unavailable' && b.status === 'unavailable') return a.reason === b.reason
  return true
}
