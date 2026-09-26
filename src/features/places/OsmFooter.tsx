import { useTranslation } from 'react-i18next'
import { Map as MapIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { osmObjectUrl } from './placeDisplay'
import type { OsmSnapshot } from '../../types/models'

/** "OpenStreetMap · 19/09/2026 · Refresh · Correct": the source, its date, and the two ways to fix it. */
export function OsmFooter({
  osm,
  onRefresh,
  refreshing = false,
}: {
  osm: OsmSnapshot
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const { t, i18n } = useTranslation()
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }).format(
    new Date(osm.checkedAt),
  )
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-gray-600">
      <MapIcon size={13} aria-hidden="true" />
      {t('place.osmSource', { date })}
      {onRefresh && (
        <>
          <span aria-hidden="true">·</span>
          <Button variant="link" size="xs" onClick={onRefresh} disabled={refreshing}>
            {t('place.refresh')}
          </Button>
        </>
      )}
      <span aria-hidden="true">·</span>
      <a
        href={osmObjectUrl(osm)}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-brand-strong underline"
      >
        {t('place.correct')}
      </a>
    </p>
  )
}
