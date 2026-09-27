import type { TFunction } from 'i18next'
import type { OsmSnapshot, Restaurant } from '../../types/models'

/** Cities split into numbered arrondissements, keyed by their postcode's département. */
const ARRONDISSEMENTS: Readonly<Record<string, { city: string; count: number }>> = {
  '75': { city: 'Paris', count: 20 },
  '69': { city: 'Lyon', count: 9 },
  '13': { city: 'Marseille', count: 16 },
}

/** The arrondissement of a Paris, Lyon or Marseille address, else null. 75116 is Paris 16e. */
function arrondissement(osm: OsmSnapshot): number | null {
  const postcode = osm.postcode
  if (!postcode || !/^\d{5}$/.test(postcode)) return null
  const known = ARRONDISSEMENTS[postcode.slice(0, 2)]
  if (!known || osm.city !== known.city) return null
  const n = postcode === '75116' ? 16 : Number(postcode.slice(2))
  return n >= 1 && n <= known.count ? n : null
}

/** The zone a list card and a search result show: "Paris 11e", else the city. */
export function shortZone(osm: OsmSnapshot, t: TFunction, language: string): string | undefined {
  const n = arrondissement(osm)
  if (n === null) return osm.city
  const category = new Intl.PluralRules(language, { type: 'ordinal' }).select(n)
  const suffix = t(`place.ordinalSuffix.${category}`)
  return t('place.arrondissement', { city: osm.city, number: n, suffix })
}

/** The "zone · street" line a list preview shows: the short zone and the OSM street, joined. */
export function zoneAndStreet(osm: OsmSnapshot, t: TFunction, language: string): string {
  return [shortZone(osm, t, language), osm.street].filter(Boolean).join(' · ')
}

/** The detail's subtitle: the short zone, then the quarter (arrondissement) or the suburb. */
export function detailZone(osm: OsmSnapshot, t: TFunction, language: string): string | undefined {
  const zone = shortZone(osm, t, language)
  const area = arrondissement(osm) === null ? osm.suburb : osm.quarter
  if (!zone) return area
  return area && area !== osm.city && area !== zone ? `${zone} · ${area}` : zone
}

/** "32 Rue Saint-Maur, 75011 Paris" once matched to OSM; the stored address otherwise, unchanged. */
export function compactAddress(r: Pick<Restaurant, 'address' | 'osm'>): string | undefined {
  if (!r.osm?.street) return r.address
  const locality = [r.osm.postcode, r.osm.city].filter(Boolean).join(' ')
  return locality ? `${r.osm.street}, ${locality}` : r.osm.street
}

/** Where "Correct" sends the user: the object's page on openstreetmap.org. */
export function osmObjectUrl(osm: Pick<OsmSnapshot, 'type' | 'id'>): string {
  return `https://www.openstreetmap.org/${osm.type}/${osm.id}`
}

/** A website by its host ("leservan.com"), or the value as-is when it is not a URL. */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
