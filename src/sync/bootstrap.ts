/**
 * Composition root. Resolves *where* the backend lives, starts the controllers that need one, and
 * paints the shell — once per page load, in that order (KTD3).
 *
 * It is a module rather than the body of `main.tsx` so the ordering below can be tested: the entry
 * point is reduced to a call that supplies the React mount. It is still the composition root — it
 * is imported by nothing but `main.tsx` and never mounted inside a component, so a remount cannot
 * repeat it and StrictMode cannot double-invoke it (which is exactly what resolving configuration
 * inside a React effect would do).
 *
 * Ordering is the whole point:
 *   1. **Await the configuration** — nothing may touch a backend before we know there is one. The
 *      client's base URL is empty until then, and an empty base URL resolves against the app's own
 *      origin, so a call made too early is not a visibly-wrong request, it is a silent one.
 *   2. **Record presence, then start the controllers _only when a backend is configured_** (R7).
 *      Both starts stay the same idempotent, safe-when-signed-out calls documented in
 *      `docs/journal/solutions/architecture-patterns/restart-controllers-on-startup.md`; presence
 *      gates whether they are reached, it does not add a branch inside them.
 *   3. **Tell the truth about sync, then render in a `finally`** — a throw anywhere above must
 *      still paint a shell. A local-first app whose data lives in IndexedDB has no reason to show
 *      a blank page because a configuration file did not load. But it must not paint a *backed up*
 *      claim it cannot keep either: see `reportUnsyncableIfAddressUnknown` below.
 *   4. **Health-check after render is scheduled** — presence gates the first paint, reachability
 *      never does (KD3).
 */
import { auth } from '../auth/auth'
import { startPendingResolver } from '../capture/resolvePending'
import { getBackendStatus, setBackendPresence, setBackendReachability } from './backendStatus'
import { isOnline, onOnlineChange } from './onlineStatus'
import { pb } from './pocketbase'
import { loadRuntimeConfig, type LoadRuntimeConfigOptions } from './runtimeConfig'
import { setSyncState } from './syncStatus'

/**
 * Boot the app. `render` paints the React shell; it is injected rather than imported so this
 * module — and its tests — never pull in the component tree.
 *
 * Resolves once the shell has been rendered, with a teardown that releases everything bootstrap
 * subscribed to. Production never calls it (the page load *is* the lifetime); tests do.
 */
export interface BootstrapOptions extends LoadRuntimeConfigOptions {
  /** Override the health-check budget. Tests use a short one; production takes the default. */
  healthTimeoutMs?: number
}

export async function bootstrap(
  render: () => void,
  options: BootstrapOptions = {},
): Promise<() => void> {
  const teardown: Array<() => void> = []
  let addressIsKnown = false

  try {
    const presence = await loadRuntimeConfig(options)
    setBackendPresence(presence)
    if (presence.status === 'configured') {
      addressIsKnown = true
      // Assigned before anything below can issue a request. `baseURL` is a plain mutable field and
      // constructing the client did no I/O, so the module-scope client needs no lazy construction.
      pb.baseURL = presence.pocketbaseUrl
      // Restore runtime state a persisted session implies — no-op when signed out.
      void auth.resume().catch((err) => console.error('[startup] sync resume failed', err))
      // Retry provisional short-link records now and on every reconnect. It needs the server-side
      // hook to resolve a link at all, so with no backend there is nothing for it to do (R7).
      teardown.push(startPendingResolver())
    }
  } catch (err) {
    // `loadRuntimeConfig` promises never to reject; this is the safety net for that promise being
    // broken, not a second error path. Presence stays `unavailable`, which is the honest answer.
    console.error('[startup] backend configuration could not be resolved', err)
  } finally {
    reportUnsyncableIfAddressUnknown()
    render()
  }

  if (addressIsKnown) {
    const healthTimeoutMs = options.healthTimeoutMs ?? HEALTH_CHECK_TIMEOUT_MS
    void checkReachability(healthTimeoutMs)
    // Re-derive rather than write once and strand: a launch with no network reports unreachable,
    // and the header would keep saying so for the life of the tab without this.
    teardown.push(
      onOnlineChange(() => {
        if (isOnline()) void checkReachability(healthTimeoutMs)
      }),
    )
  }

  return () => {
    for (const off of teardown) off()
  }
}

/**
 * Say the true thing about sync when no controller will start, before the first paint.
 *
 * `syncStatus` initialises to `synced` and `SyncController` is otherwise its only writer of
 * `state`, so a presence of `unavailable` -- a backend belongs to this deployment but its address
 * could not even be read -- would leave a signed-in user's account menu reading "all synced" for
 * the life of the tab while nothing syncs, next to a header badge already saying the server is
 * unreachable. Two adjacent, contradictory claims, and the wrong one is the reassuring one.
 *
 * Only `unavailable`. `absent` is a deployment that ships no backend on purpose, where the settled
 * remedy is clearing the session (`App.tsx`) so the claim has no surface to appear on; calling a
 * server unreachable when there is no server would be its own lie.
 *
 * Nothing is lost in the meantime. A record is pending while `syncedUpdated !== updated`, that
 * marker is persisted, and `pendingCount` self-corrects on every local write independently of any
 * controller -- so the next startup that does resolve a configuration pushes the backlog. This
 * only stops the app from claiming that already happened.
 */
function reportUnsyncableIfAddressUnknown(): void {
  if (getBackendStatus().presence.status !== 'unavailable') return
  setSyncState('problem', 'server-unreachable')
}

/**
 * How long to wait for the health check before calling the backend unreachable.
 *
 * Deliberately its own number rather than `CONFIG_TIMEOUT_MS`: that budget gates the first paint,
 * this one runs after it, so the two are not one decision and must not move together. It is the
 * more patient of the two on purpose — this check competes with the app's own cold-start traffic
 * (assets, tiles, the first sync), and a tight bound would report "unreachable" on a slow but
 * perfectly working connection, which is a false alarm on the one signal that exists to be
 * trusted. Nothing renders while reachability is `unknown` (ADR-0002), so the patience costs no
 * wrong pixel — only a later-arriving true answer.
 */
const HEALTH_CHECK_TIMEOUT_MS = 5_000

/**
 * Newest health check wins. Incremented on entry, compared before either write.
 *
 * Needed because `requestKey: null` below opts out of the SDK's auto-cancellation, which used to
 * serialise these for us: an online/offline flap can now leave two checks in flight, and without
 * this a slow *earlier* one could resolve last and pin the store to an answer that is already out
 * of date. Cheaper and clearer than reintroducing cancellation we do not want.
 */
let healthGeneration = 0

/**
 * Ask the configured backend whether it is answering. Never throws; writes the store either way.
 *
 * The bound is the point. `pb.health.check()` inherits `fetch`'s default of waiting forever, so a
 * connection that is accepted and then never answered — a half-open socket, a proxy that holds the
 * request — would leave this promise pending for the life of the tab and strand reachability at
 * `unknown`, which renders no indicator at all. "Did not answer in time" is unreachable, so the
 * abort lands in the same catch as a refused connection.
 *
 * `requestKey: null` is load-bearing, not decoration. With the SDK's auto-cancellation active —
 * the default — `initSendOptions` overwrites `signal` with its own controller's, so an
 * `AbortSignal.timeout` passed alongside it is silently discarded and the hang is unbounded after
 * all. Opting this one request out is what lets our signal survive to `fetch`.
 */
async function checkReachability(timeoutMs: number): Promise<void> {
  const generation = ++healthGeneration
  try {
    await pb.health.check({ requestKey: null, signal: AbortSignal.timeout(timeoutMs) })
    if (generation === healthGeneration) setBackendReachability('reachable')
  } catch {
    if (generation === healthGeneration) setBackendReachability('unreachable')
  }
}
