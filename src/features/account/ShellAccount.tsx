import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import { AccountMenu } from './AccountMenu'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { badgeColorClassName, pillToneClassName } from '../sync/syncStatusPresentation'
import { useMeasuredSizeVar } from '../../lib/useMeasuredSizeVar'

/**
 * Same `hidden sm:inline` gate the Sign in button's " with Google" suffix uses just below, and for
 * the same reason: on a phone this group sits in the header beside the title and stays `shrink-0`
 * by deliberate bug fix (see the header's title group in App.tsx), so anything that widens it
 * pushes the row past a ~320px viewport. Passed through `Badge`'s own `labelClassName` rather than
 * reached at with a descendant selector.
 */
const INDICATOR_LABEL_GATE = 'hidden sm:inline'

/**
 * Indicator for a backend that belongs to this deployment but cannot be used right now (R6, KD7) —
 * a configured instance that is down, or a configuration that could not be read at all. Reported
 * to signed-out visitors too: a private instance that is merely down must never read as a
 * deliberately backend-free build.
 *
 * Copy lives under its own `backend` namespace rather than reusing `sync.*`: the sync wording
 * promises the app will keep retrying in the background, which no signed-out visitor has a
 * controller running to make true. Tone and shape come from the sync presentation helper and the
 * `Badge` primitive so this pill can never drift from the account menu's status chip.
 *
 * The accessible name is explicit because the visible label is `display: none` below `sm`, which
 * would otherwise leave a bare colored dot with no name at all.
 */
function BackendUnreachableIndicator() {
  const { t } = useTranslation()
  const label = t('backend.unreachable')
  return (
    <span
      role="status"
      aria-label={label}
      title={t('backend.unreachableDetail')}
      className="inline-flex shrink-0 items-center"
    >
      <Badge
        text={label}
        tint
        tone={pillToneClassName('problem')}
        dotClassName={badgeColorClassName('problem')}
        labelClassName={INDICATOR_LABEL_GATE}
      />
    </span>
  )
}

/** Google's four-color "G": on the icon-only desktop button it is the whole label. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="hidden h-4 w-4 md:block">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

interface ShellAccountProps {
  signedIn: boolean
  email: string | null
  avatarUrl: string | null
  /** Presence answered `absent`: this build has no backend, so Sign in does not exist (R4). */
  backendAbsent: boolean
  /** No address is known, so Sign in is present but inert (KTD9). */
  signInDisabled: boolean
  showBackendProblem: boolean
  onSignIn: () => void
  onSignOut: () => void
  onOpenSettings: () => void
}

/**
 * The account controls: the outage indicator, then either the avatar menu or Sign in + Settings.
 *
 * On a phone they sit at the right of the header band. On desktop the header shrinks to the top of
 * the sidebar, so they float over the map's top-right corner instead (`md:fixed`) — authored here,
 * inside the header, to keep their place in the tab order. There Sign in drops to Google's mark
 * alone, and this group's measured width feeds `--account-float-width` so the filter overlay stops
 * short of it rather than running underneath. `text-gray-900` resets the band's white text, which
 * the white secondary buttons would otherwise inherit.
 */
export function ShellAccount({
  signedIn,
  email,
  avatarUrl,
  backendAbsent,
  signInDisabled,
  showBackendProblem,
  onSignIn,
  onSignOut,
  onOpenSettings,
}: ShellAccountProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useMeasuredSizeVar(ref, '--account-float-width', 'width')
  useMeasuredSizeVar(ref, '--account-float-height', 'height')

  return (
    <div
      ref={ref}
      className="flex shrink-0 items-center gap-2 text-gray-900 md:fixed md:top-[var(--filter-overlay-gap)] md:right-[var(--filter-overlay-gap)] md:z-[var(--z-dropdown)]"
    >
      {showBackendProblem && <BackendUnreachableIndicator />}
      {signedIn ? (
        <AccountMenu
          email={email}
          avatarUrl={avatarUrl}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
        />
      ) : (
        /* A fragment carrying both controls, and only the Sign in half is gated: gating the
           fragment would take Settings — and with it the language switcher — off the demo
           entirely (R21). */
        <>
          {!backendAbsent && (
            <Button
              id="shell-signin-button"
              variant="secondary"
              className="inline-flex h-9 items-center md:w-9 md:justify-center md:p-0"
              // Present but inert when the configuration itself could not be read (KTD9): there
              // is no address, so an active control would open an authentication window against
              // the visitor's own machine. A known address that is merely down keeps working —
              // retrying can succeed there.
              disabled={signInDisabled}
              // The desktop button shows only the mark, so the tooltip spells out what it does.
              title={signInDisabled ? t('backend.signInUnavailable') : t('shell.signInWithGoogle')}
              onClick={onSignIn}
            >
              <GoogleMark />
              {/* sr-only, not hidden: the words stay the button's accessible name on desktop. */}
              <span className="md:sr-only">
                {t('shell.signIn')}
                <span className="hidden sm:inline"> {t('shell.withGoogle')}</span>
              </span>
            </Button>
          )}
          <Button variant="band-icon" onClick={onOpenSettings} aria-label={t('settings.openAria')}>
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  )
}
