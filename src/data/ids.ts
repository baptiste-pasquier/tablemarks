const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 15

/**
 * Stable client-generated id, reused as the PocketBase record id so sync merges
 * rather than duplicates. Matches PocketBase's default id shape (15 chars, [a-z0-9]).
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH))
  let out = ''
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length]
  return out
}

export function now(): string {
  return new Date().toISOString()
}
