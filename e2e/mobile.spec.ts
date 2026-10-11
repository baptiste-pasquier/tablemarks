// Runs on `mobile-webkit` only (see `MOBILE_ONLY` in playwright.config.ts): the switch and the
// pill exist below the `md` breakpoint alone.
import { expect, test } from './fixtures'
import { addBySearch, openApp, placeCard } from './app'
import { PLACES } from './osm'

test('the List/Map switch and the "Filters · N" pill', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await openApp(page)
  await addBySearch(page, name)

  const nav = page.getByRole('navigation', { name: 'View' })
  const list = nav.getByRole('button', { name: 'List' })
  const map = nav.getByRole('button', { name: 'Map' })
  await expect(list).toHaveAttribute('aria-pressed', 'true')

  await map.click()
  await expect(map).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name })).toBeVisible()
  await expect(placeCard(page, name)).toBeHidden()

  const pill = page.getByRole('button', { name: /^Filters · \d+$/ })
  await expect(pill).toHaveText('Filters · 0')
  await pill.click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'To try', exact: true }).click()
  await sheet.getByRole('button', { name: 'See results' }).click()
  await expect(sheet).toBeHidden()
  await expect(pill).toHaveText('Filters · 1')

  await list.click()
  await expect(pill).toHaveText('Filters · 1')
  await expect(placeCard(page, name)).toBeVisible()
})
