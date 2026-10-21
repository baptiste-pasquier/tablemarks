import type { Verdict, Visit } from '../types/models'

export interface Rollup {
  latestVerdict: Verdict | null
  latestVisitDate: string | null
  visitCount: number
}

/**
 * Orders visits most recent first: dated before undated, two dated by `date` descending, and any
 * remaining tie (same day, or both undated) by `updated` descending. Negative when `a` is more
 * recent.
 */
export function compareVisitsMostRecentFirst(a: Visit, b: Visit): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1
    if (b.date === null) return -1
    return a.date < b.date ? 1 : -1
  }
  if (a.updated === b.updated) return 0
  return a.updated < b.updated ? 1 : -1
}

/**
 * Pure rollup: the verdict of the most recent visit (see `compareVisitsMostRecentFirst`, so a
 * dated visit always beats an undated one) + count, over non-deleted visits.
 */
export function rollupOf(visits: Visit[]): Rollup {
  const live = visits.filter((v) => !v.deleted)
  if (live.length === 0) {
    return { latestVerdict: null, latestVisitDate: null, visitCount: 0 }
  }
  const latest = [...live].sort(compareVisitsMostRecentFirst)[0]
  return {
    latestVerdict: latest.verdict,
    latestVisitDate: latest.date,
    visitCount: live.length,
  }
}
