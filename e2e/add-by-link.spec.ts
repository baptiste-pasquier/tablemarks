import { expect, test } from './fixtures'
import { closeDialog, openApp, placeCard, submitQuery } from './app'
import { PLACES } from './osm'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('a full Google Maps link creates the place', async ({ page }) => {
  const { name, lat, lng } = PLACES.leServan
  const link = `https://www.google.com/maps/place/${name.replaceAll(' ', '+')}/@${lat},${lng},17z`
  const dialog = await submitQuery(page, link)
  await expect(dialog.getByText('Found on OpenStreetMap')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(placeCard(page, name)).toBeVisible()
})

test('a short maps.app.goo.gl link is refused without a backend, and nothing is sent', async ({
  page,
  network,
}) => {
  const dialog = await submitQuery(page, 'https://maps.app.goo.gl/abc123')
  await expect(dialog.getByRole('note')).toContainText('this app runs without one')
  expect(network.mocked.filter((u) => u.startsWith('https://nominatim.'))).toEqual([])
  await closeDialog(page)
  await expect(page.getByText('No places yet')).toBeVisible()
})
