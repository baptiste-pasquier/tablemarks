import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlaceActions } from './PlaceActions'
import type { Restaurant } from '../../types/models'

const BASE: Restaurant = {
  id: 'r1',
  name: 'Chez Marcel',
  lat: 48.8566,
  lng: 2.3522,
  pending: false,
  latestVerdict: null,
  latestVisitDate: null,
  visitCount: 0,
  updated: '2026-09-26T10:00:00.000Z',
  deleted: false,
}

describe('PlaceActions', () => {
  it('dials only the first of several `;`-separated OSM phone values already stored', () => {
    render(
      <PlaceActions
        restaurant={{
          ...BASE,
          osm: {
            type: 'node',
            id: 1,
            checkedAt: '2026-09-26T10:00:00.000Z',
            phone: '+33 1 42 72 00 00;+33 6 12 34 56 78',
          },
        }}
      />,
    )
    expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute('href', 'tel:+33142720000')
  })
})
