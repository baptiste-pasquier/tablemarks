import type { ReactNode } from 'react'

// gray-600, not gray-400: an eyebrow is small, and gray-400 measured under 2.5:1 on white.
const EYEBROW_CLASSES = 'text-xs font-semibold uppercase tracking-wide text-gray-600'

/**
 * Shared section-title styling for the cross-file "eyebrow" label pattern (KD6, R6): small,
 * bold, uppercase, letter-spaced, muted gray. Defaults to `span` but accepts `h3` so callers that
 * need a real heading landmark (e.g. `SettingsPanel`) don't lose it. Does not cover `FilterBar`'s
 * `GroupLabel` sub-labels — those use a different, smaller size token and stay a local component
 * (KD6).
 */
export function Eyebrow({ as = 'span', children }: { as?: 'span' | 'h3'; children: ReactNode }) {
  const Tag = as
  return <Tag className={EYEBROW_CLASSES}>{children}</Tag>
}
