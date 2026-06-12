/** Stable client-generated id, reused as the PocketBase record id so sync merges rather than duplicates. */
export function newId(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}
