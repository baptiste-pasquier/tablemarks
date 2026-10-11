import { expect, test } from './fixtures'
import { addBySearch, openApp, placeCard, showMap, submitQuery } from './app'
import { PLACES } from './osm'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('a place added by name search shows in the list and on the map', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await addBySearch(page, name)
  await expect(placeCard(page, name)).toContainText('To try')
  await showMap(page)
  await expect(page.getByRole('img', { name })).toBeVisible()
})

test('a name nothing matches says so', async ({ page }) => {
  const dialog = await submitQuery(page, 'Nowhere Bistro')
  await expect(dialog.getByText('No matching places found.')).toBeVisible()
})
