import { expect, test } from './fixtures'
import { addBySearch, logVisit, openApp, placeCard, toggleFilter } from './app'
import { PLACES } from './osm'

test.beforeEach(async ({ page }) => {
  await openApp(page)
  await addBySearch(page, PLACES.chezMarcel.name)
  await addBySearch(page, PLACES.leServan.name)
})

test('a visit with a verdict replaces "To try", and the filters find it', async ({ page }) => {
  const marcel = placeCard(page, PLACES.chezMarcel.name)
  const servan = placeCard(page, PLACES.leServan.name)
  await expect(marcel).toContainText('To try')

  await logVisit(page, PLACES.chezMarcel.name, 'Go back')
  await expect(marcel).toContainText('Go back')
  await expect(marcel).not.toContainText('To try')

  await toggleFilter(page, 'Go back')
  await expect(marcel).toBeVisible()
  await expect(servan).toBeHidden()

  await toggleFilter(page, 'Go back')
  await toggleFilter(page, 'To try')
  await expect(servan).toBeVisible()
  await expect(marcel).toBeHidden()
})
