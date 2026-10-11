import { expect, test } from './fixtures'
import { addBySearch, openApp, openPlace, placeCard } from './app'
import { PLACES } from './osm'

test('a place is deleted from its detail, and only once confirmed', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await openApp(page)
  await addBySearch(page, name)

  const detail = await openPlace(page, name)
  await detail.getByRole('button', { name: 'Delete this place' }).click()
  await expect(detail.getByText('This can’t be undone.')).toBeVisible()
  await detail.getByRole('button', { name: 'Cancel' }).click()
  await expect(detail.getByText('This can’t be undone.')).toBeHidden()

  await detail.getByRole('button', { name: 'Delete this place' }).click()
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(detail).toBeHidden()
  await expect(placeCard(page, name)).toBeHidden()
  await expect(page.getByText('No places yet')).toBeVisible()
})
