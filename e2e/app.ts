// What a person does in the app, in the words the app shows them. Every locator is a role, a label
// or a visible `en` string — never a class — so a restyle cannot break a journey.
import { expect, type Locator, type Page } from '@playwright/test'

/** Below Tailwind's `md` breakpoint the app shows one pane at a time behind the List/Map switch. */
function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768
}

/** Escapes a string for safe interpolation into a `new RegExp(...)` source. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function switchView(page: Page, view: 'List' | 'Map'): Promise<void> {
  if (!isMobile(page)) return
  await page.getByRole('navigation', { name: 'View' }).getByRole('button', { name: view }).click()
}

export async function showList(page: Page): Promise<void> {
  await switchView(page, 'List')
}

export async function showMap(page: Page): Promise<void> {
  await switchView(page, 'Map')
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
}

/** A place's list card. Hidden when the place is filtered out, deleted, or the map pane is showing. */
export function placeCard(page: Page, name: string): Locator {
  return page.getByRole('listitem').filter({ hasText: name })
}

/** Escape closes every `Modal`; a panel with two ✕ buttons (Settings) needs no disambiguation. */
export async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
}

/** Opens "Add a place", types or pastes `text`, and presses Search. Returns the dialog. */
export async function submitQuery(page: Page, text: string): Promise<Locator> {
  await showList(page)
  await page.getByRole('button', { name: '+ Add a place' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Paste a Google Maps link, or type a place name').fill(text)
  await dialog.getByRole('button', { name: 'Search' }).click()
  return dialog
}

export async function addBySearch(page: Page, name: string): Promise<void> {
  const dialog = await submitQuery(page, name)
  // A result card's name starts with the place's; the non-eatery row starts with "Passage".
  await dialog.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) }).click()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(placeCard(page, name)).toBeVisible()
}

export async function openPlace(page: Page, name: string): Promise<Locator> {
  await showList(page)
  await placeCard(page, name).getByRole('button').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name })).toBeVisible()
  return dialog
}

/** "I'm here now" with a verdict: logs today's visit, then closes the detail. */
export async function logVisit(page: Page, name: string, verdict: string): Promise<void> {
  const dialog = await openPlace(page, name)
  await dialog.getByRole('button', { name: 'I’m here now' }).click()
  await dialog.getByRole('button', { name: verdict, exact: true }).click()
  // The picker leaves once the visit is written; closing earlier could race the write.
  await expect(dialog.getByText('How was it?')).toBeHidden()
  await closeDialog(page)
}

/** Toggles one status or verdict chip: in the overlay on desktop, in the pill's sheet on a phone. */
export async function toggleFilter(page: Page, label: string): Promise<void> {
  if (!isMobile(page)) {
    await page.getByRole('button', { name: label, exact: true }).click()
    return
  }
  await page.getByRole('button', { name: /^Filters · \d+$/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: label, exact: true }).click()
  await sheet.getByRole('button', { name: 'See results' }).click()
  await expect(sheet).toBeHidden()
}

export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open settings' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
  return dialog
}
