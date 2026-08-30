const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Current UTC instant, as a canonical ISO string. */
export function now(): string {
  return new Date().toISOString()
}

/**
 * Today's local calendar day (device timezone), as `YYYY-MM-DD` — not the UTC slice of `now()`,
 * so a late-night visit doesn't roll to the next/previous day.
 */
export function today(): string {
  return formatLocalDay(new Date())
}

/**
 * A local calendar day's correct UTC instant range in the device's current timezone: `start` is
 * local midnight on `day`, `end` is local midnight on the following day (exclusive upper bound).
 * Built from the local `Date` constructor so the runtime's own timezone resolution does the
 * offset math, rather than assuming a fixed UTC end-of-day suffix.
 */
export function localDayToInstantRange(day: string): { start: string; end: string } {
  const [year, month, date] = day.split('-').map(Number)
  const start = new Date(year, month - 1, date, 0, 0, 0, 0)
  const end = new Date(year, month - 1, date + 1, 0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** The viewer's local calendar day (device timezone) for a given UTC instant, for display. */
export function instantToLocalDay(instant: string): string {
  return formatLocalDay(new Date(instant))
}

/** Re-serializes any parseable instant string into the app's canonical `toISOString()` shape. */
export function normalizeInstant(value: string): string {
  return new Date(value).toISOString()
}

/** Whether `value` has the `YYYY-MM-DD` local-day shape (not a full instant or garbage). */
export function isLocalDay(value: string): boolean {
  return LOCAL_DAY_PATTERN.test(value)
}

function formatLocalDay(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}
