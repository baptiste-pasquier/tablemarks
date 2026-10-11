import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ModalHeader } from './ModalHeader'

// Component tests don't drive a real i18next instance (see i18n/config.test.ts for that
// coverage) — a lightweight passthrough keeps `t('common.close')` resolving to real copy here.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'common.close' ? 'Close' : key) }),
}))

describe('ModalHeader', () => {
  it('renders the title and calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<ModalHeader title="Add a place" onClose={onClose} />)
    const user = userEvent.setup()

    expect(screen.getByRole('heading', { name: 'Add a place' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders no close button when there is nothing to close', () => {
    render(<ModalHeader title="Sending your changes…" />)

    expect(screen.getByRole('heading', { name: 'Sending your changes…' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the detail variant with a larger, top-aligned heading for a dynamic title', () => {
    render(<ModalHeader title="Chez Marcel" onClose={vi.fn()} variant="detail" />)

    expect(screen.getByRole('heading', { name: 'Chez Marcel' })).toHaveClass('text-lg')
  })

  it('renders an optional subtitle under the title', () => {
    render(
      <ModalHeader
        title="Le Servan"
        subtitle="Paris 11th · Quartier de la Roquette"
        onClose={() => {}}
        variant="detail"
      />,
    )
    expect(screen.getByText('Paris 11th · Quartier de la Roquette')).toBeInTheDocument()
  })
})
