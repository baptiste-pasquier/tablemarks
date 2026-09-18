/// <reference path="../pb_data/types.d.ts" />

// Resolves a maps.app.goo.gl short link to coordinates for a signed-in caller.
// The browser cannot follow Google's cross-origin redirect, so we do it here.
//
// Authentication is required (`$apis.requireAuth()` at the bottom of this file). The route was
// public at first so capture would work with no account, but that reasoning only ever covered one
// case: a *configured* backend with a signed-out user. With no backend configured the client
// refuses the paste before calling (src/capture/capture.ts), so the demo never reaches this route.
// Against that one case stands the cost of answering an anonymous caller: every hit forks a curl
// process and opens a TLS connection, so an unauthenticated GET is a denial-of-service lever on
// an internet-exposed instance. A signed-out paste now saves a provisional record instead, which
// the pending resolver retries once the user signs in (src/capture/resolvePending.ts).
//
// This is code, not topology, so it does not belong to the operator steps KD5 assigns to the
// console: unlike a per-IP rate limit, it needs no trusted-proxy header and it survives a pb_data
// restore.
//
// Verified against PocketBase 0.39.3 (the version docker/Dockerfile.pocketbase pins). Both
// PocketBase-internals facts this file depends on were confirmed empirically against a running
// container, not read off the type definitions:
//
//  1. A `routerAdd` handler body runs in its own goja VM with NO access to file-level scope.
//     A helper or constant declared outside the handler raises `ReferenceError` at call time,
//     which PocketBase reports to the caller as a generic 400. Everything this route needs is
//     therefore declared *inside* the handler.
//
//  2. `$http.send` calls Go's `http.DefaultClient`, which follows up to 10 redirects before
//     returning, and its result exposes only { json, headers, cookies, raw, body, statusCode } —
//     there is no final-URL field, whatever `pb_data/types.d.ts` suggests. It is unusable here on
//     both counts: it cannot tell us where the short link pointed, and asking it would already
//     have fetched whatever the upstream named. `curl` without `-L` is the fetch primitive
//     instead; the runtime image installs it for exactly this reason.

routerAdd('GET', '/api/tablemarks/resolve-short-link', (e) => {
  // --- scope note ------------------------------------------------------------------
  // Do not lift any of the following out of this function. See point 1 in the header.
  // ----------------------------------------------------------------------------------

  // Only Google Maps short-link hosts may be fetched. This is the SSRF guard: without it, an
  // unauthenticated caller could make the server fetch internal hosts (cloud metadata, the
  // 127.0.0.1 admin API, private ranges). The full-URL path is handled client-side, so the hook
  // only ever needs the short-link host the Maps app actually produces. `goo.gl` — the
  // general-purpose Google redirector — is deliberately NOT here: the client never emits one, and
  // it would turn this route into an open redirect-follower for anything Google ever shortened.
  const ALLOWED_SHORT_LINK_HOSTS = ['maps.app.goo.gl']

  // Where a redirect is allowed to lead. Anchored on both ends, with at most two suffix labels,
  // so `www.google.com.attacker.example` cannot pass as `google.<tld>`.
  const ALLOWED_DESTINATION_HOST = /^(www\.|maps\.)?google\.[a-z]{2,}(\.[a-z]{2,})?$/

  const MAX_URL_LENGTH = 2048

  // Splits an https URL into host and path without following anything.
  function parseHttpsUrl(u) {
    const m = /^https:\/\/([^/?#]+)([^?#]*)/i.exec(u)
    if (!m) return null
    return { host: m[1].toLowerCase(), path: m[2] || '' }
  }

  const url = e.request.url.query().get('url')
  if (!url) {
    return e.json(400, { error: 'missing url parameter' })
  }
  // 422, not 400, for both of the verdicts below, and the distinction is load-bearing. PocketBase
  // turns any exception thrown in here into a generic 400 (see the header), so the client cannot
  // tell a 400 that means "this URL is unusable" from a 400 that means "the hook crashed". It
  // treats 422 as final and everything else as retryable, so a verdict has to say 422 or a user's
  // link is retried forever -- and a crash has to stay a 400 or their link is refused forever
  // (review #4). `missing url parameter` keeps its 400: our client cannot produce it, and a
  // caller that does has a bug worth retrying rather than a URL worth rejecting.
  if (url.length > MAX_URL_LENGTH) {
    return e.json(422, { error: 'url is too long' })
  }

  const source = parseHttpsUrl(url)
  if (!source || ALLOWED_SHORT_LINK_HOSTS.indexOf(source.host) === -1) {
    return e.json(422, { error: 'only https://maps.app.goo.gl/ short links are allowed' })
  }

  // One request, to the allowlisted host, and no second one. `-L` is absent so curl does not
  // follow the redirect, `--max-redirs 0` says so a second time, and `-o /dev/null` throws the
  // response body away — a short link's body is a stub page we have no use for. `%{redirect_url}`
  // is curl's absolutised Location, so a relative redirect resolves against the allowlisted
  // origin rather than being re-parsed here.
  let probe
  try {
    probe = toString(
      $os
        .cmd(
          'curl',
          '--silent',
          '--show-error',
          '--output', '/dev/null',
          '--proto', '=https',
          '--max-redirs', '0',
          // Bound how long one anonymous-shaped request can hold a process and a socket. A Google
          // redirect answers in well under a second; 4s is slack, not a budget.
          '--connect-timeout', '2',
          '--max-time', '4',
          '--write-out', '%{http_code} %{redirect_url}',
          '--',
          url,
        )
        .output(),
    )
  } catch (err) {
    // Never hand the caller the upstream error. "connection refused" and "timed out" read
    // differently, and that difference is what turns a blind request into a network probe.
    $app.logger().warn('resolve-short-link: upstream fetch failed', 'host', source.host, 'error', String(err))
    return e.json(502, { error: 'could not resolve the short link' })
  }

  const gap = probe.indexOf(' ')
  const status = gap === -1 ? 0 : parseInt(probe.slice(0, gap), 10)
  const location = gap === -1 ? '' : probe.slice(gap + 1).trim()

  if (status < 300 || status > 399 || !location || location.length > MAX_URL_LENGTH) {
    // Same reasoning as above: one opaque answer for every upstream outcome.
    $app.logger().warn('resolve-short-link: upstream did not redirect', 'host', source.host, 'status', status)
    return e.json(502, { error: 'could not resolve the short link' })
  }

  // The redirect target is read as a *string*. Nothing fetches it — the coordinates are in the
  // URL, and a body could carry a spoofed @lat,lng anyway.
  const destination = parseHttpsUrl(location)
  if (!destination || !ALLOWED_DESTINATION_HOST.test(destination.host) || destination.path.indexOf('/maps') !== 0) {
    return e.json(422, { error: 'resolved URL is not a Google Maps link' })
  }

  const coords = location.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!coords) {
    return e.json(422, { error: 'could not extract coordinates from link' })
  }

  let name
  const place = location.match(/\/maps\/place\/([^/@]+)/)
  if (place) {
    const raw = place[1].replace(/\+/g, ' ')
    try {
      name = decodeURIComponent(raw)
    } catch (err) {
      // Malformed percent-encoding. The client twin does exactly this (`parseMapsUrl.ts`), and
      // here it matters more: an uncaught throw leaves the handler as a generic 400, and the
      // coordinates we already extracted are lost with it (review #5).
      name = raw
    }
  }

  return e.json(200, {
    lat: parseFloat(coords[1]),
    lng: parseFloat(coords[2]),
    name: name,
  })
}, $apis.requireAuth())
