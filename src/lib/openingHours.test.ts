import { describe, expect, it } from 'vitest'
import {
  ADDITIONAL_RULE_SOURCE,
  formatClock,
  openStateAt,
  openStateOf,
  parseOpeningHours,
  type Week,
} from './openingHours'

/** 2026-09-21 is a Monday; `day` 0 = Monday. Local time, like the app. */
function at(day: number, clock: string): Date {
  const [h, m] = clock.split(':').map(Number)
  return new Date(2026, 8, 21 + day, h, m)
}

function week(raw: string): Week {
  const parsed = parseOpeningHours(raw)
  if (!parsed) throw new Error(`unparseable: ${raw}`)
  return parsed
}

const H = (clock: string) => {
  const [h, m] = clock.split(':').map(Number)
  return h * 60 + m
}

describe('parseOpeningHours', () => {
  it('reads days, ranges and several spans a day', () => {
    const w = week('Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30')
    expect(w[0]).toEqual([{ start: H('19:00'), end: H('22:30') }])
    expect(w[3]).toEqual([
      { start: H('12:15'), end: H('14:00') },
      { start: H('19:00'), end: H('22:30') },
    ])
    expect(w[5]).toEqual([])
    expect(w[6]).toEqual([])
  })

  it('wraps a range through Sunday', () => {
    const w = week('Su-Th 11:00-24:00, Fr,Sa 11:00-02:00')
    expect(w[6]).toEqual([{ start: H('11:00'), end: 1440 }])
    expect(w[4]).toEqual([{ start: H('11:00'), end: 1440 + H('02:00') }])
  })

  it('adds a comma rule to the days it names, and replaces them with a semicolon rule', () => {
    expect(week('Mo-Fr 19:30-22:30, Tu-Fr 12:00-14:00')[1]).toEqual([
      { start: H('12:00'), end: H('14:00') },
      { start: H('19:30'), end: H('22:30') },
    ])
    expect(week('Mo-Su 12:00-23:00; We off')[2]).toEqual([])
  })

  it('applies a rule without days to every day', () => {
    const w = week('18:00-23:00, Mo-Sa 11:30-14:30')
    expect(w[6]).toEqual([{ start: H('18:00'), end: H('23:00') }])
    expect(w[0]).toHaveLength(2)
  })

  it('reads 24/7 and ignores public-holiday selectors', () => {
    expect(week('24/7').every((d) => d.length === 1 && d[0].end === 1440)).toBe(true)
    expect(week('Mo-Su,PH 11:00-23:00')[0]).toEqual([{ start: H('11:00'), end: H('23:00') }])
    expect(week('Mo-Fr 12:00-14:00; PH off')[0]).toHaveLength(1)
  })

  it('merges overlapping spans from additive rules on different days', () => {
    const w = week('Mo-Su 08:00-20:00, Fr,Sa 08:00-23:00')
    expect(w[4]).toEqual([{ start: H('08:00'), end: H('23:00') }])
    expect(w[0]).toEqual([{ start: H('08:00'), end: H('20:00') }])
  })

  it('returns correct closing time for merged spans', () => {
    expect(openStateAt(week('Mo-Su 08:00-20:00, Fr,Sa 08:00-23:00'), at(4, '10:00'))).toEqual({
      kind: 'open',
      closesAt: H('23:00'),
    })
  })

  it('merges touching spans', () => {
    expect(week('Mo 12:00-14:00,14:00-16:00')[0]).toEqual([{ start: H('12:00'), end: H('16:00') }])
  })

  it.each([
    '',
    'Mo-Sa',
    'Mo-Fr 10:00-20:00 || "by appointment"',
    '11:30-23:00; Mo-Th 15:00-18:30 closed',
    'Mo-Fr 08:00-sunset',
    'week 1-20 Mo-Fr 12:00-14:00',
    'Jan-Mar Mo-Fr 12:00-14:00',
    'Mo 25:00-26:00',
    'Mo-PH 10:00-12:00',
    'PH-Mo 10:00-12:00',
  ])('refuses %j', (raw) => {
    expect(parseOpeningHours(raw)).toBeNull()
  })
})

describe('openStateAt', () => {
  const servan = week('Mo-Fr 19:30-22:30, Tu-Fr 12:00-14:00')

  it('is open inside a span, with its closing time', () => {
    expect(openStateAt(servan, at(1, '12:30'))).toEqual({ kind: 'open', closesAt: H('14:00') })
  })

  it('opens soon within two hours, closed with a time beyond', () => {
    expect(openStateAt(servan, at(1, '18:40'))).toEqual({ kind: 'opens-soon', opensAt: H('19:30') })
    expect(openStateAt(servan, at(1, '15:00'))).toEqual({ kind: 'closed', opensAt: H('19:30') })
  })

  it('is closed today once the last span is over, or on a day off', () => {
    expect(openStateAt(servan, at(1, '23:00'))).toEqual({ kind: 'closed-today' })
    expect(openStateAt(servan, at(5, '12:30'))).toEqual({ kind: 'closed-today' })
  })

  it("stays open past midnight on yesterday's span", () => {
    const late = week('Mo-Fr 11:00-02:00')
    expect(openStateAt(late, at(5, '01:00'))).toEqual({ kind: 'open', closesAt: H('02:00') })
    expect(openStateAt(late, at(4, '23:30'))).toEqual({ kind: 'open', closesAt: H('02:00') })
    expect(openStateAt(late, at(5, '02:00'))).toEqual({ kind: 'closed-today' })
  })

  it('has no closing time around the clock', () => {
    expect(openStateAt(week('24/7'), at(3, '03:00'))).toEqual({ kind: 'open', closesAt: null })
  })
})

describe('openStateOf and formatClock', () => {
  it('is null for an absent or unreadable value', () => {
    expect(openStateOf(undefined, at(0, '12:00'))).toBeNull()
    expect(openStateOf('sunrise-sunset', at(0, '12:00'))).toBeNull()
  })

  it('formats minutes as a 24-hour clock, wrapping past midnight', () => {
    expect(formatClock(H('09:05'))).toBe('09:05')
    expect(formatClock(1440)).toBe('00:00')
    expect(formatClock(1440 + 90)).toBe('01:30')
  })

  it('returns at once for a weekday range that ends on PH, instead of looping forever', () => {
    expect(openStateOf('Mo-PH 10:00-12:00', at(0, '12:00'))).toBeNull()
  })
})

describe('Safari lookbehind safety', () => {
  it('has no lookbehind, unsupported by Safari 16.0–16.3', () => {
    expect(ADDITIONAL_RULE_SOURCE).not.toContain('(?<')
  })
})
