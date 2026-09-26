import { describe, expect, it } from 'vitest'
import { candidateFrom, isEatery, type NominatimRow } from './osmTags'

const CHECKED = '2026-09-26T10:00:00.000Z'

const SEPTIME: NominatimRow = {
  osm_type: 'node',
  osm_id: 3602657896,
  lat: '48.8536026',
  lon: '2.3809558',
  category: 'amenity',
  type: 'restaurant',
  name: 'Septime',
  display_name: 'Septime, 80, Rue de Charonne, Paris 11e Arrondissement, Paris, 75011, France',
  address: {
    house_number: '80',
    road: 'Rue de Charonne',
    city_block: 'Quartier Sainte-Marguerite',
    suburb: 'Paris 11e Arrondissement',
    city: 'Paris',
    postcode: '75011',
  },
  extratags: {
    cuisine: 'french',
    'contact:phone': '+33 1 43 67 38 29',
    'contact:website': 'http://septime-charonne.fr/',
    opening_hours: 'Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30',
  },
}

describe('candidateFrom', () => {
  it('maps a restaurant row to a candidate with its snapshot', () => {
    expect(candidateFrom(SEPTIME, CHECKED)).toEqual({
      name: 'Septime',
      lat: 48.8536026,
      lng: 2.3809558,
      address: SEPTIME.display_name,
      osmClass: 'amenity=restaurant',
      cuisineTag: 'french',
      osm: {
        type: 'node',
        id: 3602657896,
        checkedAt: CHECKED,
        street: '80 Rue de Charonne',
        postcode: '75011',
        city: 'Paris',
        suburb: 'Paris 11e Arrondissement',
        quarter: 'Quartier Sainte-Marguerite',
        openingHours: 'Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30',
        phone: '+33 1 43 67 38 29',
        website: 'http://septime-charonne.fr/',
      },
    })
  })

  it('prefers the plain phone/website tags, and falls back through town and village', () => {
    const c = candidateFrom(
      {
        ...SEPTIME,
        address: { village: "Collonges-au-Mont-d'Or", postcode: '69660' },
        extratags: { phone: '+33 1', 'contact:phone': '+33 2', website: 'https://a.fr' },
      },
      CHECKED,
    )
    expect(c.osm).toMatchObject({
      city: "Collonges-au-Mont-d'Or",
      phone: '+33 1',
      website: 'https://a.fr',
    })
    expect(c.osm).not.toHaveProperty('street')
  })

  it('keeps only the first of several `;`-separated phone or website values', () => {
    const c = candidateFrom(
      { ...SEPTIME, extratags: { phone: 'a;b', website: 'https://a.fr;https://b.fr' } },
      CHECKED,
    )
    expect(c.osm).toMatchObject({ phone: 'a', website: 'https://a.fr' })
  })

  it('has no snapshot and no class for a row without an OSM identity', () => {
    const c = candidateFrom({ display_name: 'Chez Marcel, Paris', lat: '1', lon: '2' }, CHECKED)
    expect(c).toEqual({ name: 'Chez Marcel', lat: 1, lng: 2, address: 'Chez Marcel, Paris' })
  })
})

describe('isEatery', () => {
  it.each([
    ['amenity=restaurant', true],
    ['amenity=cafe', true],
    ['amenity=pub', true],
    ['shop=pastry', true],
    ['shop=bakery', true],
    ['shop=leather', false],
    ['highway=residential', false],
  ])('%s → %s', (osmClass, expected) => {
    expect(isEatery({ osmClass })).toBe(expected)
  })

  it('is false without a class', () => {
    expect(isEatery({})).toBe(false)
  })
})
