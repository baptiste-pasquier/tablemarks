/**
 * The two coupled deadlines on reading `config.json`, in one place because they are one decision.
 *
 * The page fetches the file with its own abort, and — on an installed app — a service worker sits
 * in front of that fetch with a NetworkFirst policy that falls back to the cached copy once the
 * network has been silent for its own timeout. The worker's timeout must fire **first**, or the
 * page aborts the request before the fallback can ever deliver: an installed app on a slow network
 * would then resolve `unavailable` while holding a perfectly good cached configuration.
 *
 * They are exported from here, not from `runtimeConfig.ts`, so `vite.config.ts` can read the
 * worker's value without importing a browser module into the build config. Keep this file free of
 * imports for the same reason.
 */

/**
 * Budget for the whole resolution. Well under the geocoder's 10s (`src/capture/geocode.ts`)
 * because this one gates the first paint rather than a background lookup.
 */
export const CONFIG_TIMEOUT_MS = 3_000

/**
 * How long the service worker waits for the network before serving its cached `config.json`.
 * Strictly less than `CONFIG_TIMEOUT_MS`, with enough margin for the cached response to reach the
 * page — `configTimeouts.test.ts` pins that ordering so the two cannot drift apart silently.
 */
export const CONFIG_SW_NETWORK_TIMEOUT_SECONDS = 2
