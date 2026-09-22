import { render, screen, waitFor } from '@testing-library/react'
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

describe('DeleteRestaurant', () => {
  it('asks before deleting: the first click deletes nothing and moves focus to Cancel', async () => {
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    const onDeleted = vi.fn()
    render(
      <DeleteRestaurant restaurantId={r.id} name={r.name} visitCount={0} onDeleted={onDeleted} />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))

    expect(screen.getByText('Delete “Chez Paul”?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect((await getRestaurant(r.id))?.deleted).toBe(false)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('names the visits that go with the place, so the cost of confirming is visible', async () => {
    render(
      <DeleteRestaurant restaurantId="r1" name="Chez Paul" visitCount={3} onDeleted={vi.fn()} />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))

    expect(screen.getByText('Delete “Chez Paul” and its 3 visits?')).toBeInTheDocument()
  })

  it('backs out on Cancel: the place stays and focus returns to the delete button', async () => {
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    render(
      <DeleteRestaurant restaurantId={r.id} name={r.name} visitCount={0} onDeleted={vi.fn()} />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete “Chez Paul”?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete this place' })).toHaveFocus()
    expect((await getRestaurant(r.id))?.deleted).toBe(false)
  })

  it('tombstones the place and its visits on confirm, then reports the deletion', async () => {
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2026-05-20', verdict: 'go_back' })
    const onDeleted = vi.fn()
    render(
      <DeleteRestaurant restaurantId={r.id} name={r.name} visitCount={1} onDeleted={onDeleted} />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect((await getRestaurant(r.id))?.deleted).toBe(true)
    expect((await allVisitsForSync()).every((v) => v.deleted)).toBe(true)
  })

  it('tells the user when the delete fails, stays open, and lets them retry', async () => {
    vi.mocked(removeRestaurant).mockRejectedValueOnce(new Error('QuotaExceededError'))
    const r = await createRestaurant({ name: 'Chez Paul', lat: 1, lng: 1 })
    const onDeleted = vi.fn()
    render(
      <DeleteRestaurant restaurantId={r.id} name={r.name} visitCount={0} onDeleted={onDeleted} />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete this place.')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect((await getRestaurant(r.id))?.deleted).toBe(true)
  })

  it('disables both buttons while the delete is being written, so a double tap cannot race it', async () => {
    let finish!: () => void
    vi.mocked(removeRestaurant).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    render(
      <DeleteRestaurant restaurantId="r1" name="Chez Paul" visitCount={0} onDeleted={vi.fn()} />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Delete this place' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish()
  })
})
