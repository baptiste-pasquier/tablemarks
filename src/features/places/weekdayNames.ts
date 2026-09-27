/** Short weekday names in `language`, Monday first ("Mon"…, "lun."…). 2024-01-01 was a Monday. */
export function weekdayNames(language: string): string[] {
  const format = new Intl.DateTimeFormat(language, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)))
}
