import { describe, expect, it } from 'vitest'
import { compactAddress, detailZone, osmObjectUrl, shortZone, websiteLabel } from './placeDisplay'
import { mockI18n } from '../../test/setup'
import type { OsmSnapshot } from '../../types/models'

const t = mockI18n.t.bind(mockI18n)

function osm(over: Partial<OsmSnapshot>): OsmSnapshot {
  return { type: 'node', id: 1, checkedAt: '2026-09-26T10:00:00.000Z', ...over }
}

describe('shortZone', () => {
  it.each([
    [{ city: 'Paris', postcode: '75011' }, 'Paris 11th'],
    [{ city: 'Paris', postcode: '75001' }, 'Paris 1st'],
    [{ city: 'Paris', postcode: '75116' }, 'Paris 16th'],
    [{ city: 'Lyon', postcode: '69001' }, 'Lyon 1st'],
    [{ city: 'Marseille', postcode: '13007' }, 'Marseille 7th'],
    [{ city: 'Bordeaux', postcode: '33000', suburb: 'Bordeaux Sud' }, 'Bordeaux'],
    [{ city: 'Aix-en-Provence', postcode: '13100' }, 'Aix-en-Provence'],
    [{ city: 'Paris', postcode: '75021' }, 'Paris'],
  ])('%o → %s in English', (over, expected) => {
    expect(shortZone(osm(over), t, 'en')).toBe(expected)
  })

  it('writes French ordinals', async () => {
    await mockI18n.changeLanguage('fr')
    const tFr = mockI18n.t.bind(mockI18n)
    expect(shortZone(osm({ city: 'Paris', postcode: '75011' }), tFr, 'fr')).toBe('Paris 11e')
    expect(shortZone(osm({ city: 'Lyon', postcode: '69001' }), tFr, 'fr')).toBe('Lyon 1er')
  })

  it('is undefined without a city', () => {
    expect(shortZone(osm({ postcode: '75011' }), t, 'en')).toBeUndefined()
  })
})

describe('detailZone', () => {
  it('adds the quarter to an arrondissement, the suburb elsewhere', () => {
    expect(
      detailZone(
        osm({
          city: 'Paris',
          postcode: '75011',
          suburb: 'Paris 11e Arrondissement',
          quarter: 'Quartier de la Roquette',
        }),
        t,
        'en',
      ),
    ).toBe('Paris 11th · Quartier de la Roquette')
    expect(detailZone(osm({ city: 'New York', suburb: 'Manhattan' }), t, 'en')).toBe(
      'New York · Manhattan',
    )
  })

  it('does not repeat the city', () => {
    expect(detailZone(osm({ city: 'Lyon', suburb: 'Lyon' }), t, 'en')).toBe('Lyon')
  })
})

describe('compactAddress, osmObjectUrl, websiteLabel', () => {
  it('prefers the OSM street with its postcode and city, else the stored address', () => {
    const address = '32, Rue Saint-Maur, Paris…'
    expect(
      compactAddress({
        address,
        osm: osm({ street: '32 Rue Saint-Maur', postcode: '75011', city: 'Paris' }),
      }),
    ).toBe('32 Rue Saint-Maur, 75011 Paris')
    expect(
      compactAddress({ address, osm: osm({ street: '32 Rue Saint-Maur', city: 'Paris' }) }),
    ).toBe('32 Rue Saint-Maur, Paris')
    expect(compactAddress({ address, osm: osm({ street: '32 Rue Saint-Maur' }) })).toBe(
      '32 Rue Saint-Maur',
    )
    expect(compactAddress({ address, osm: osm({ postcode: '75011', city: 'Paris' }) })).toBe(
      address,
    )
    expect(compactAddress({ address: '1 Rue de Paris' })).toBe('1 Rue de Paris')
  })

  it('links the OSM object', () => {
    expect(osmObjectUrl({ type: 'way', id: 42 })).toBe('https://www.openstreetmap.org/way/42')
  })

  it('shows a website by its host', () => {
    expect(websiteLabel('https://www.leservan.com/fr/')).toBe('leservan.com')
    expect(websiteLabel('not a url')).toBe('not a url')
  })
})
