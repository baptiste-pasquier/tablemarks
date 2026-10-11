import { expect, test } from './fixtures'
import { addBySearch, closeDialog, logVisit, openApp, openSettings, placeCard } from './app'
import { PLACES } from './osm'

test('an export imported into an empty browser brings back the same places', async ({
  page,
  freshPage,
}, testInfo) => {
  const marcel = PLACES.chezMarcel.name
  const servan = PLACES.leServan.name
  await openApp(page)
  await addBySearch(page, marcel)
  await addBySearch(page, servan)
  await logVisit(page, marcel, 'Go back')

  const settings = await openSettings(page)
  const downloading = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Export collection' }).click()
  const file = testInfo.outputPath('tablemarks-export.json')
  await (await downloading).saveAs(file)

  await openApp(freshPage)
  await expect(freshPage.getByText('No places yet')).toBeVisible()
  const panel = await openSettings(freshPage)
  await panel.getByLabel('Import a backup file').setInputFiles(file)
  await expect(panel).toContainText('Import 2 places and 1 visit?')
  await panel.getByRole('button', { name: 'Confirm import' }).click()
  // `added` counts restaurant + visit records together (src/sync/portability/import.ts), not
  // places alone: 2 restaurants + 1 visit, confirmed by that module's own unit tests.
  await expect(panel).toContainText('Imported: 3 added, 0 updated, 0 unchanged.')
  await closeDialog(freshPage)

  await expect(placeCard(freshPage, marcel)).toContainText('Go back')
  await expect(placeCard(freshPage, servan)).toContainText('To try')
})
