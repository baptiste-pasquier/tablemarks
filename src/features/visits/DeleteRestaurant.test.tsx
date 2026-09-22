import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { DeleteRestaurant } from './DeleteRestaurant'
import { createRestaurant, getRestaurant, removeRestaurant } from '../../data/restaurants'
import { allVisitsForSync, createVisit } from '../../data/visits'

// Partial mock: the real repository, with `removeRestaurant` spied so one test can make it fail.
vi.mock('../../data/restaurants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/restaurants')>()
  return { ...actual, removeRestaurant: vi.fn(actual.removeRestaurant) }
})

beforeEach(freshDB)

function renderDelete(
  props: { restaurantId?: string; name?: string; visitCount?: number } = {},
  onPendingChange = vi.fn(),
) {
  render(
    <DeleteRestaurant
      restaurantId={props.restaurantId ?? 'r1'}
      name={props.name ?? 'Chez Paul'}
      visitCount={props.visitCount ?? 0}
      onPendingChange={onPendingChange}
    />,
  )
  return { onPendingChange, user: userEvent.setup() }
}

describe('DeleteRestaurant', () => {
  it('asks before deleting: the first click deletes nothing and moves focus to Cancel', async () => {
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    const { onPendingChange, user } = renderDelete({ restaurantId: r.id })

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))

    expect(screen.getByText('Delete “Chez Paul”?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect((await getRestaurant(r.id))?.deleted).toBe(false)
    expect(onPendingChange).not.toHaveBeenCalled()
  })

  it('names the visits that go with the place, so the cost of confirming is visible', async () => {
    const { user } = renderDelete({ visitCount: 3 })

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))

    expect(screen.getByText('Delete “Chez Paul” and its 3 visits?')).toBeInTheDocument()
  })

  it('backs out on Cancel: the place stays and focus returns to the delete button', async () => {
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    const { user } = renderDelete({ restaurantId: r.id })

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete “Chez Paul”?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete this place' })).toHaveFocus()
    expect((await getRestaurant(r.id))?.deleted).toBe(false)
  })

  it('tombstones the place and its visits on confirm, reporting the write as pending', async () => {
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2026-05-20', verdict: 'go_back' })
    const { onPendingChange, user } = renderDelete({ restaurantId: r.id, visitCount: 1 })

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(async () => expect((await getRestaurant(r.id))?.deleted).toBe(true))
    expect((await allVisitsForSync()).every((v) => v.deleted)).toBe(true)
    // Never released on success: the detail, seeing the tombstone, unmounts this instead.
    expect(onPendingChange.mock.calls).toEqual([[true]])
  })

  it('tells the user when the delete fails, releases the pending state, and lets them retry', async () => {
    vi.mocked(removeRestaurant).mockRejectedValueOnce(new Error('QuotaExceededError'))
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    const { onPendingChange, user } = renderDelete({ restaurantId: r.id })

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete this place.')
    expect(onPendingChange.mock.calls).toEqual([[true], [false]])
    expect((await getRestaurant(r.id))?.deleted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await getRestaurant(r.id))?.deleted).toBe(true))
  })

  it('hands focus back to Delete after a failure, which disabling it during the write had dropped', async () => {
    let fail!: (e: Error) => void
    vi.mocked(removeRestaurant).mockImplementationOnce(
      () => new Promise<void>((_, reject) => (fail = reject)),
    )
    const { user } = renderDelete()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    // A browser drops focus from a control the moment it is disabled; jsdom keeps it there (and
    // ignores blur() on a disabled control), so move it away by hand.
    const elsewhere = document.body.appendChild(document.createElement('input'))
    act(() => elsewhere.focus())
    await act(async () => fail(new Error('QuotaExceededError')))

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    elsewhere.remove()
  })

  it('disables both buttons while the delete is being written, so a double tap cannot race it', async () => {
    let finish!: () => void
    vi.mocked(removeRestaurant).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    const { user } = renderDelete()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // Settle the write inside the test, so its state updates cannot leak into the next one.
    await act(async () => finish())
  })
})
