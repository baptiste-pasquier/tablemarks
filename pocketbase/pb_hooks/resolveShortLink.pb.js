/// <reference path="../pb_data/types.d.ts" />

// Public route that resolves a maps.app.goo.gl short link to coordinates.
// The browser cannot follow Google's cross-origin redirect, so we do it here.
// Callable without authentication so it works in no-account (local) mode.
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
  if (url.length > MAX_URL_LENGTH) {
    return e.json(400, { error: 'url is too long' })
  }

  const source = parseHttpsUrl(url)
  if (!source || ALLOWED_SHORT_LINK_HOSTS.indexOf(source.host) === -1) {
    return e.json(400, { error: 'only https://maps.app.goo.gl/ short links are allowed' })
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
          '--max-time', '10',
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
    name = decodeURIComponent(place[1].replace(/\+/g, ' '))
  }

  return e.json(200, {
    lat: parseFloat(coords[1]),
    lng: parseFloat(coords[2]),
    name: name,
  })
})
