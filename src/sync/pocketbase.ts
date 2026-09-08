import PocketBase from 'pocketbase'

/**
 * Shared PocketBase client. Auth state persists in localStorage via the SDK's default store.
 *
 * Constructed with an **empty** base URL on purpose (KD2/R3): the backend location is read at
 * runtime from `config.json` and assigned by the bootstrap (`src/sync/bootstrap.ts`), so the built
 * bundle carries no deployment hostname. Constructing the client does no network I/O and `baseURL`
 * is a public mutable field, so the client stays at module scope and every importer keeps a stable
 * reference. Until the bootstrap assigns it, an empty base URL resolves against the app's own
 * origin — which is why the bootstrap starts no backend-touching controller before it does.
 */
export const pb = new PocketBase('')

export interface ResolvedLink {
  lat: number
  lng: number
  name?: string
}

/**
 * Resolve a `maps.app.goo.gl` short link to coordinates via the server-side hook.
 * The browser can't follow Google's cross-origin redirect, so PocketBase does it.
 */
export async function resolveShortLink(url: string): Promise<ResolvedLink> {
  const res = await pb.send<Partial<ResolvedLink>>('/api/tablemarks/resolve-short-link', {
    method: 'GET',
    query: { url },
  })
  if (typeof res.lat !== 'number' || typeof res.lng !== 'number') {
    throw new Error('Short link did not resolve to coordinates')
  }
  return { lat: res.lat, lng: res.lng, name: res.name }
}
