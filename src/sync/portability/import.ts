import { validateEnvelope, type ValidationResult } from './schema'

/**
 * Parse untrusted file text into validated, current-shape records, or a structured error.
 * Never throws and never touches the store — validate-then-commit: the caller only writes
 * once this returns `ok: true`.
 */
export function parseImport(text: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  return validateEnvelope(parsed)
}
