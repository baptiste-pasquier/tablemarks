import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockI18n } from '../../test/setup'
import { freshDB } from '../../test/idb'
import { SettingsPanel } from './SettingsPanel'

beforeEach(freshDB)

describe('SettingsPanel', () => {
  it('renders the Language and Export/Import sections with the panel title', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Language')).toBeInTheDocument()
    // PortabilityPanel supplies its own heading — no separate "Export / Import" heading here.
    expect(screen.getByRole('heading', { name: /export/i })).toBeInTheDocument()
  })

  it('shows English active by default and switches the active language on click (R3)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SettingsPanel onClose={vi.fn()} />)

    const frenchButton = screen.getByRole('button', { name: 'Français' })
    const englishButton = screen.getByRole('button', { name: 'English' })
    expect(englishButton).toHaveAttribute('aria-pressed', 'true')
    expect(frenchButton).toHaveAttribute('aria-pressed', 'false')

    const changeLanguageSpy = vi.spyOn(mockI18n, 'changeLanguage')
    await user.click(frenchButton)
    expect(changeLanguageSpy).toHaveBeenCalledWith('fr')

    rerender(<SettingsPanel onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps "Français" and "English" labels fixed regardless of the active UI language', async () => {
    await mockI18n.changeLanguage('fr')
    render(<SettingsPanel onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Français' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    await mockI18n.changeLanguage('en')
  })

  it('calls onClose from the panel-level close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsPanel onClose={onClose} />)
    // PortabilityPanel nests its own close button too, so target the Settings heading's. The
    // heading sits in ModalHeader's own title wrapper (for an optional subtitle); its close
    // button is a sibling of that wrapper, one level up.
    const settingsHeading = screen.getByRole('heading', { name: 'Settings' })
    const closeButton = settingsHeading.parentElement?.parentElement?.querySelector('button')
    expect(closeButton).toBeTruthy()
    await user.click(closeButton as HTMLButtonElement)
    expect(onClose).toHaveBeenCalled()
  })
})
