/// <reference path="../pb_data/types.d.ts" />

// Public route that resolves a maps.app.goo.gl short link to coordinates.
// The browser cannot follow Google's cross-origin redirect, so we do it here.
// Callable without authentication so it works in no-account (local) mode.
//
// NOTE: the $http / router API shape is PocketBase-version-specific (targets v0.26).
// Verify against the running binary's pb_data/types.d.ts after `pocketbase serve`.

routerAdd('GET', '/api/tablemarks/resolve-short-link', (e) => {
  const url = e.request.url.query().get('url')
  if (!url) {
    return e.json(400, { error: 'missing url parameter' })
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
