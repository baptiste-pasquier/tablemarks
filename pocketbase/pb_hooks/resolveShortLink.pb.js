/// <reference path="../pb_data/types.d.ts" />

// Public route that resolves a maps.app.goo.gl short link to coordinates.
// The browser cannot follow Google's cross-origin redirect, so we do it here.
// Callable without authentication so it works in no-account (local) mode.
//
// NOTE: the $http / router API shape is PocketBase-version-specific (targets v0.26).
// Verify against the running binary's pb_data/types.d.ts after `pocketbase serve`.

// Only Google Maps short-link hosts may be fetched. This is the SSRF guard: without it,
// an unauthenticated caller could make the server fetch internal hosts (cloud metadata,
// 127.0.0.1 admin API, private ranges). The full-URL path is handled client-side, so the
// hook only ever needs the short-link hosts.
var ALLOWED_HOSTS = ['maps.app.goo.gl', 'goo.gl']

function allowedShortLink(u) {
  var m = /^https:\/\/([^/?#]+)/i.exec(u)
  if (!m) return false
  var host = m[1].toLowerCase()
  return ALLOWED_HOSTS.indexOf(host) !== -1
}

routerAdd('GET', '/api/tablemarks/resolve-short-link', (e) => {
  const url = e.request.url.query().get('url')
  if (!url) {
    return e.json(400, { error: 'missing url parameter' })
  }
  if (!allowedShortLink(url)) {
    return e.json(400, { error: 'only https maps.app.goo.gl / goo.gl short links are allowed' })
  }

  let res
  try {
    res = $http.send({ url: url, method: 'GET', timeout: 10 })
  } catch (err) {
    return e.json(502, { error: 'failed to fetch short link', detail: String(err) })
  }

  // The expanded URL after redirects (or a Location header) carries the @lat,lng segment.
  const location =
    res.headers && res.headers['Location'] ? res.headers['Location'][0] : ''
  const haystack = [location, res.url || '', res.raw || ''].join(' ')

  const coords = haystack.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!coords) {
    return e.json(422, { error: 'could not extract coordinates from link' })
  }

  let name
  const place = haystack.match(/\/maps\/place\/([^/@]+)/)
  if (place) {
    name = decodeURIComponent(place[1].replace(/\+/g, ' '))
  }

  return e.json(200, {
    lat: parseFloat(coords[1]),
    lng: parseFloat(coords[2]),
    name: name,
  })
})
