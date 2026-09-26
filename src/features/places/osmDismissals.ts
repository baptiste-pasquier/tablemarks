/** Device-local: places whose proposed OSM match the user refused. A preference, not data. */
const KEY = 'tablemarks:osmDismissed'

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function isOsmDismissed(id: string): boolean {
  return read().includes(id)
}

export function dismissOsm(id: string): void {
  const ids = read()
  if (ids.includes(id)) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids, id]))
  } catch {
    // Storage blocked or full: the offer simply comes back next time the detail opens.
  }
}
