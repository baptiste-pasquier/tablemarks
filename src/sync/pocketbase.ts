import PocketBase from 'pocketbase'

const PB_URL = (import.meta.env.VITE_PB_URL as string | undefined) ?? 'http://127.0.0.1:8090'

/** Shared PocketBase client. Auth state persists in localStorage via the SDK's default store. */
export const pb = new PocketBase(PB_URL)

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
