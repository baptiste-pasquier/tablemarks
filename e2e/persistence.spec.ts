import { expect, test } from './fixtures'
import { addBySearch, logVisit, openApp, placeCard } from './app'
import { PLACES } from './osm'

test('places and verdicts survive a reload', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await openApp(page)
  await addBySearch(page, name)
  await logVisit(page, name, 'Worth a detour')

  // Same page, same context: IndexedDB is the only thing that can bring these back.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
  await expect(placeCard(page, name)).toContainText('Worth a detour')
})
