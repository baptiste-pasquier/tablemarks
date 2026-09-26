/**
 * A reader for the common subset of OpenStreetMap's `opening_hours` syntax: weekday selectors
 * (singles, ranges wrapping through Sunday, comma lists), time spans (several a day, past
 * midnight), `off`/`closed`, `24/7`, and `PH` (accepted, not modelled). Anything else — weeks,
 * months, dates, `sunrise`, comments, `||` fallbacks, "closed" spans — makes the whole value
 * unreadable, and the UI shows it raw. This subset reads ~95% of the Paris values measured.
 */

const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const
type DayCode = (typeof DAY_CODES)[number]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const MINUTES_PER_DAY = 1440

/** How close an opening must be to read as "opens soon". */
export const OPENS_SOON_MINUTES = 120

/** An opening interval in minutes from its day's midnight; `end` past 1440 runs into the next day. */
export interface Span {
  start: number
  end: number
}

/** Seven days of spans, Monday first. An empty day is closed. */
export type Week = Span[][]

export type OpenState =
  /** `closesAt` is null when the place is open around the clock. */
  | { kind: 'open'; closesAt: number | null }
  | { kind: 'opens-soon'; opensAt: number }
  | { kind: 'closed'; opensAt: number }
  | { kind: 'closed-today' }

const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)'
const RULE = new RegExp(`^(?:(${DAY}(?:-${DAY})?(?:,${DAY}(?:-${DAY})?)*)\\s+)?(.+)$`)
// A comma that ends one rule and starts the next ("Su-Th 11:00-24:00, Fr,Sa 11:00-02:00"): it
// follows a time or off/closed and precedes a weekday. A comma inside a weekday list ("Mo,We")
// follows a letter, and one inside a time list precedes a digit, so neither matches.
//
// No lookbehind (Safari 16.0–16.3 cannot parse it): the ending digit/off/closed is captured
// instead, and `splitAdditionalRules` re-joins it onto the text before the split.
const ADDITIONAL_RULE = new RegExp(`(\\d|off|closed)\\s*,\\s*(?=${DAY}\\b)`)
const TIME = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/

/**
 * Splits a chunk on the commas `ADDITIONAL_RULE` matches, without a lookbehind: `String.split`
 * with a capturing separator interleaves each captured group into the result, so the piece before
 * a split is missing exactly the digit/off/closed text the group captured — glue it back on.
 */
function splitAdditionalRules(chunk: string): string[] {
  const pieces = chunk.split(ADDITIONAL_RULE)
  const rules: string[] = []
  for (let i = 0; i < pieces.length; i += 2) {
    const captured = pieces[i + 1]
    rules.push(captured === undefined ? pieces[i] : pieces[i] + captured)
  }
  return rules
}

function parseDays(selector: string): number[] | null {
  const days = new Set<number>()
  for (const part of selector.split(',')) {
    const [from, to] = part.split('-')
    // A bare `PH` selector names no weekday and is skipped; PH as either end of a range makes the
    // whole value unreadable (no next-day wrap would ever reach it — see the design journal entry).
    if (from === 'PH' && to === undefined) continue
    if (from === 'PH' || to === 'PH') return null
    const start = DAY_CODES.indexOf(from as DayCode)
    const end = to === undefined ? start : DAY_CODES.indexOf(to as DayCode)
    if (start === -1 || end === -1) return null
    for (let d = start; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === end) break
    }
  }
  return [...days]
}

function parseTimes(text: string): Span[] | null {
  if (text === 'off' || text === 'closed') return []
  const spans: Span[] = []
  for (const part of text.split(',')) {
    const m = TIME.exec(part.trim())
    if (!m) return null
    const [sh, sm, eh, em] = m.slice(1).map(Number)
    const start = sh * 60 + sm
    let end = eh * 60 + em
    if (sm > 59 || em > 59 || start >= MINUTES_PER_DAY || end > 2 * MINUTES_PER_DAY) return null
    if (end <= start) end += MINUTES_PER_DAY
    spans.push({ start, end })
  }
  return spans
}

function parseRule(rule: string): { days: number[]; spans: Span[] } | null {
  if (rule === '24/7') return { days: ALL_DAYS, spans: [{ start: 0, end: MINUTES_PER_DAY }] }
  const m = RULE.exec(rule)
  if (!m) return null
  const spans = parseTimes(m[2].trim())
  if (!spans) return null
  const days = m[1] === undefined ? ALL_DAYS : parseDays(m[1])
  if (!days) return null
  return { days, spans }
}

/** Merge overlapping or touching spans, keeping the earliest start and latest end. */
function mergeOverlappingSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return []
  const merged: Span[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && last.end >= span.start) {
      // Overlapping or touching: extend the last span
      last.end = Math.max(last.end, span.end)
    } else {
      // No overlap: add as a new span
      merged.push({ ...span })
    }
  }
  return merged
}

export function parseOpeningHours(raw: string): Week | null {
  const chunks = raw
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  if (chunks.length === 0) return null
  const week: Week = Array.from({ length: 7 }, () => [])
  for (const chunk of chunks) {
    for (const [i, text] of splitAdditionalRules(chunk).entries()) {
      const rule = parseRule(text.trim())
      if (!rule) return null
      // `;` starts a normal rule, which replaces its days; `,` an additional one, which adds.
      for (const d of rule.days) week[d] = i === 0 ? [...rule.spans] : [...week[d], ...rule.spans]
    }
  }
  for (const day of week) {
    day.sort((a, b) => a.start - b.start)
    const merged = mergeOverlappingSpans(day)
    day.length = 0
    day.push(...merged)
  }
  return week
}

/** 0 for Monday … 6 for Sunday, in the device's time zone. */
export function weekdayIndex(at: Date): number {
  return (at.getDay() + 6) % 7
}

/**
 * The state at an instant, in the device's time zone: OSM's reply carries no zone, and places are
 * almost always browsed in the zone they are in.
 */
export function openStateAt(week: Week, at: Date): OpenState {
  const minute = at.getHours() * 60 + at.getMinutes()
  const today = weekdayIndex(at)
  for (const s of week[(today + 6) % 7]) {
    if (minute < s.end - MINUTES_PER_DAY) return { kind: 'open', closesAt: s.end - MINUTES_PER_DAY }
  }
  for (const s of week[today]) {
    if (s.start <= minute && minute < s.end) {
      const allDay = s.start === 0 && s.end >= MINUTES_PER_DAY
      return { kind: 'open', closesAt: allDay ? null : s.end % MINUTES_PER_DAY }
    }
  }
  const next = week[today].find((s) => s.start > minute)
  if (!next) return { kind: 'closed-today' }
  return next.start - minute <= OPENS_SOON_MINUTES
    ? { kind: 'opens-soon', opensAt: next.start }
    : { kind: 'closed', opensAt: next.start }
}

/** The state for a raw tag, or null when it is absent or unreadable. */
export function openStateOf(raw: string | undefined, at: Date): OpenState | null {
  const week = raw ? parseOpeningHours(raw) : null
  return week ? openStateAt(week, at) : null
}

/** "19:30" for minutes from midnight, wrapping past midnight. */
export function formatClock(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
