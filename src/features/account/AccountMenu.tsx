import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Settings, LogOut } from 'lucide-react'
import { useSyncStatus } from '../../sync/useSyncStatus'
import { label as syncLabel, detail as syncDetail, pillToneClassName, badgeColorClassName } from '../sync/syncStatusPresentation'
import { trapTabFocus } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Eyebrow } from '../ui/Eyebrow'
import { cn } from '../../lib/cn'

interface AccountMenuProps {
  email: string | null
  avatarUrl: string | null
  onOpenSettings: () => void
  onSignOut: () => void
}

interface Position {
  top: number
  right: number
}

/**
 * Signed-in header identity control (R1, R4, R7): an avatar (photo or initial letter) carrying a
 * live sync-status badge dot, opening a dropdown with email, status chip + detail, Réglages, and
 * Se déconnecter. Replaces the old sync-status pill + email label + settings button + logout
 * button cluster (R1, R5).
 *
 * Portaled to `document.body` on `--z-dropdown` (KTD1) — the header is `sticky`/`z-index` and
 * creates its own stacking context, so a nested dropdown could never clear the mobile nav or
 * Leaflet's controls. Positioned from the trigger's `getBoundingClientRect()`, recomputed on
 * resize (KTD7), rather than CSS anchoring, since no positioning primitive exists in this repo yet.
 */
export function AccountMenu({ email, avatarUrl, onOpenSettings, onSignOut }: AccountMenuProps) {
  const { t } = useTranslation()
  const status = useSyncStatus()
  const [open, setOpen] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hasFocusedPanelRef = useRef(false)

  const initial = (email?.charAt(0) ?? '?').toUpperCase()
  const showImage = Boolean(avatarUrl) && !imageFailed

  // KTD7: anchor to the trigger's live position on open, recomputed on resize so a narrow
  // viewport or an orientation change can't leave the panel clipped or misplaced.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    updatePosition()

    // Coalesced to one recompute per animation frame — a window drag-resize fires `resize`
    // dozens of times a second, and each raw event doesn't need its own layout read + re-render.
    let scheduledFrame: number | null = null
    function onResize() {
      if (scheduledFrame !== null) return
      scheduledFrame = requestAnimationFrame(() => {
        scheduledFrame = null
        updatePosition()
      })
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame)
    }
  }, [open])

  // Focus lands on the panel itself once it mounts, not the first row — mirrors Modal's
  // `initialFocus="panel"` escape hatch so opening the dropdown never fires Réglages/Se
  // déconnecter unintentionally. Guarded to fire once per open (position updates again on resize).
  useLayoutEffect(() => {
    if (!open) {
      hasFocusedPanelRef.current = false
      return
    }
    if (position && !hasFocusedPanelRef.current) {
      panelRef.current?.focus()
      hasFocusedPanelRef.current = true
    }
  }, [open, position])

  // KTD2 dismissal (mousedown outside the trigger/panel, plus Escape) and the committed Tab-trap
  // within the panel's focusable rows, mirroring Modal.tsx's Escape-listener lifecycle and
  // reusing its trapTabFocus wrap logic directly.
  useEffect(() => {
    if (!open) return

    function close() {
      setOpen(false)
      // Deferred: a mousedown on a non-focusable outside target can itself blur the trigger via
      // the browser's own default handling of *this same* mousedown event, which applies only
      // after our listener returns — queuing the refocus for the next tick lets it win that race
      // (KTD3). Harmless for the Escape path too, which has no such competing default action.
      // Only reclaim focus if it actually fell back to nowhere (document.body) — otherwise the
      // outside click landed on some other focusable control, and yanking focus back to the
      // trigger would discard that real interaction.
      const trigger = triggerRef.current
      setTimeout(() => {
        if (document.activeElement === document.body) trigger?.focus()
      }, 0)
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      close()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (!panelRef.current) return
      trapTabFocus(panelRef.current, e)
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // KTD3: re-focus the trigger before Settings' Modal mounts and does its own focus capture,
  // so Modal never captures document.body as "previously focused".
  function handleOpenSettings() {
    triggerRef.current?.focus()
    setOpen(false)
    onOpenSettings()
  }

  function handleSignOut() {
    setOpen(false)
    onSignOut()
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('shell.accountMenuAria')}
        className="relative rounded-full transition hover:ring-2 hover:ring-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {showImage ? (
          <img
            src={avatarUrl ?? undefined}
            onError={() => setImageFailed(true)}
            alt=""
            className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5"
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-strong ring-1 ring-black/5">
            {initial}
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-white',
            badgeColorClassName(status.state),
          )}
        />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            tabIndex={-1}
            style={{ position: 'fixed', top: position.top, right: position.right }}
            className="z-[var(--z-dropdown)] w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg outline-none"
          >
            <div className="px-2">
              <Eyebrow>{t('shell.accountMenuSignedInAs')}</Eyebrow>
              <p className="truncate text-sm font-medium text-gray-900">{email}</p>
            </div>
            <div className="mt-2 w-fit px-2">
              <Badge
                text={syncLabel(status, t)}
                tone={pillToneClassName(status.state)}
                tint
                dotClassName={badgeColorClassName(status.state)}
              />
            </div>
            <p className="mt-2 px-2 text-xs text-gray-500">{syncDetail(status, t)}</p>
            <div className="my-2 border-t border-gray-100" />
            <Button
              variant="menu-item"
              tone="neutral"
              role="menuitem"
              onClick={handleOpenSettings}
            >
              <Settings className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('settings.title')}
            </Button>
            <Button
              variant="menu-item"
              tone="destructive"
              role="menuitem"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t('shell.signOut')}
            </Button>
          </div>,
          document.body,
        )}
    </div>
  )
}
