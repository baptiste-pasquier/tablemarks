/** The subset of the SDK's `authWithOAuth2` options this app sets. */
interface GoogleOAuthConfig {
  provider: 'google'
  urlCallback?: (url: string) => void
}

/**
 * Opens an empty OAuth popup, the same window and features as the PocketBase SDK's own. Must run
 * synchronously inside the click, before any `await`: Safari blocks a `window.open` made outside
 * the user gesture, and other browsers allow only a few seconds after it. Null when blocked.
 */
export function openOAuthPopup(): Window | null {
  const width = Math.min(1024, window.innerWidth)
  const height = Math.min(768, window.innerHeight)
  const left = window.innerWidth / 2 - width / 2
  const top = window.innerHeight / 2 - height / 2
  const features = `width=${width},height=${height},top=${top},left=${left},resizable,menubar=no`
  return window.open('', 'popup_window', features)
}

/**
 * Google sign-in options that send the SDK's provider URL to `popup`. With no popup (blocked),
 * the SDK's default path runs and tries to open its own.
 */
export function googleOAuthConfig(popup: Window | null): GoogleOAuthConfig {
  if (!popup) return { provider: 'google' }
  return {
    provider: 'google',
    urlCallback: (url) => {
      popup.location.href = url
    },
  }
}
