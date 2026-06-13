import { useId, useState } from 'react'
import { exportCollection } from '../../sync/portability/export'
import { parseImport, applyImport, type ImportCounts } from '../../sync/portability/import'
import type { ImportRecords } from '../../sync/portability/schema'

type Pending = { records: ImportRecords; restaurants: number; visits: number }

export function PortabilityPanel({ onClose }: { onClose: () => void }) {
  const fileInputId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [summary, setSummary] = useState<ImportCounts | null>(null)

  async function exportNow() {
    setBusy(true)
    setError(null)
    try {
      const env = await exportCollection()
      const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tablemarks-${env.exportedAt.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not export your collection.')
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(file: File) {
    setError(null)
    setSummary(null)
    setPending(null)
    let text: string
    try {
      text = await file.text()
    } catch {
      setError('Could not read that file.')
      return
    }
    const result = parseImport(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPending({
      records: result.records,
      restaurants: result.records.restaurants.length,
      visits: result.records.visits.length,
    })
  }

  async function confirmImport() {
    if (!pending) return
    setBusy(true)
    try {
      const counts = await applyImport(pending.records)
      setSummary(counts)
      setPending(null)
    } catch {
      setError('Could not import that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/30 p-4 pt-20">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Export &amp; import</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Download a full backup of your collection, or merge in a previously exported file.
        </p>

        <button
          type="button"
          onClick={() => void exportNow()}
          disabled={busy}
          className="mt-3 w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Export collection'}
        </button>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor={fileInputId} className="block text-sm text-gray-600">
            Import a backup file
          </label>
          <input
            id={fileInputId}
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pickFile(file)
            }}
            className="mt-1 w-full text-sm"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {pending && (
          <div className="mt-3 rounded-md bg-brand-soft p-3 text-sm">
            <p>
              Import <strong>{pending.restaurants}</strong> place{pending.restaurants === 1 ? '' : 's'} and{' '}
              <strong>{pending.visits}</strong> visit{pending.visits === 1 ? '' : 's'}? Existing entries merge by
              last edit; nothing is deleted.
            </p>
            <button
              type="button"
              onClick={() => void confirmImport()}
              disabled={busy}
              className="mt-2 rounded-md bg-brand px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Importing…' : 'Confirm import'}
            </button>
          </div>
        )}

        {summary && (
          <p className="mt-3 text-sm text-green-700">
            Imported: {summary.added} added, {summary.updated} updated, {summary.unchanged} unchanged.
          </p>
        )}
      </div>
    </div>
  )
}
