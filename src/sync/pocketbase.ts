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
 * This link will never resolve, however many times it is retried — the resolver refused it on its
 * merits rather than failing to answer.
 *
 * The distinction has to be made here, where the HTTP status is, because it decides something the
 * caller cannot otherwise know: whether to save a provisional record and keep retrying, or to
 * refuse now. Treating a permanent refusal as transient is what leaves a placeholder entry named
 * by the raw URL, retried on every startup, reconnect and sign-in, resolving never.
 */
export class UnresolvableShortLink extends Error {
  // A plain field, not a parameter property: `erasableSyntaxOnly` is on in tsconfig.
  readonly status: number

  constructor(status: number) {
    super(`The resolver refused this short link (${status})`)
    this.name = 'UnresolvableShortLink'
    this.status = status
  }
}

/**
 * Resolve a `maps.app.goo.gl` short link to coordinates via the server-side hook.
 * The browser can't follow Google's cross-origin redirect, so PocketBase does it.
 *
 * Throws `UnresolvableShortLink` for a refusal the caller must not retry, and anything else for a
 * failure that may succeed later.
 */
export async function resolveShortLink(url: string): Promise<ResolvedLink> {
  let res: Partial<ResolvedLink>
  try {
    res = await pb.send<Partial<ResolvedLink>>('/api/tablemarks/resolve-short-link', {
      method: 'GET',
      query: { url },
    })
  } catch (err) {
    // 422 and nothing else. The route answers 422 for its two verdicts on a URL — not a host it
    // accepts, or a link that resolved to something that is not a Maps place — and PocketBase
    // turns *any* exception thrown inside a hook handler into a generic 400. So 400 is
    // indistinguishable from a crashed hook, a missing `curl`, a shipped regression; treating it
    // as a verdict refuses the user's link permanently for a fault a retry would survive
    // (review #4). A 401, a 502 or a transport error is likewise not a verdict.
    const status = (err as { status?: number } | null)?.status
    if (status === 422) throw new UnresolvableShortLink(status)
    throw err
  }
  if (typeof res.lat !== 'number' || typeof res.lng !== 'number') {
    throw new Error('Short link did not resolve to coordinates')
  }
  return { lat: res.lat, lng: res.lng, name: res.name }
}
