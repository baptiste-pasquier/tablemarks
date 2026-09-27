import { expect, isLocal, mockFor, test } from './fixtures'

test.describe('network guard', () => {
  test('passes the app’s own origin, whatever loopback spelling', () => {
    expect(isLocal(new URL('http://localhost:4174/tablemarks/'))).toBe(true)
    expect(isLocal(new URL('http://127.0.0.1:4174/tablemarks/'))).toBe(true)
    expect(isLocal(new URL('http://[::1]:4174/tablemarks/'))).toBe(true)
    expect(isLocal(new URL('https://example.com/'))).toBe(false)
  })

  test('mocks OpenStreetMap and Google Fonts, and nothing else', () => {
    expect(mockFor(new URL('https://tile.openstreetmap.org/12/2074/1409.png'))).not.toBeNull()
    expect(
      mockFor(new URL('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans')),
    ).not.toBeNull()
    expect(
      mockFor(new URL('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=1&lon=2')),
    ).not.toBeNull()
    expect(mockFor(new URL('https://nominatim.openstreetmap.org/status'))).toBeNull()
    expect(mockFor(new URL('https://example.com/'))).toBeNull()
  })

  test('records and blocks a request to an unmocked host', async ({ page, network }) => {
    await page.goto('./')
    const outcome = await page.evaluate(() =>
      fetch('https://example.com/probe').then(
        () => 'reached',
        () => 'blocked',
      ),
    )
    expect(outcome).toBe('blocked')
    expect(network.violations).toEqual(['https://example.com/probe'])
    // Emptied so this test's own teardown — which fails on any violation — passes.
    network.violations.length = 0
  })

  test('records a WebSocket to an unmocked host as a violation', async ({ page, network }) => {
    await page.goto('./')
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const ws = new WebSocket('wss://example.com/ws')
          ws.addEventListener('open', () => resolve())
          ws.addEventListener('error', () => resolve())
        }),
    )
    expect(network.violations).toEqual(['wss://example.com/ws'])
    // Emptied so this test's own teardown — which fails on any violation — passes.
    network.violations.length = 0
  })

  test('the app loads with every external request mocked', async ({ page, network }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
    await expect(page.getByText('No places yet')).toBeVisible()
    await expect
      .poll(() => network.mocked.some((u) => u.startsWith('https://fonts.googleapis.com/')))
      .toBe(true)
  })
})
