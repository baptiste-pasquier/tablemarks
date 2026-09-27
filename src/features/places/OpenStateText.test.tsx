import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OpenStateText } from './OpenStateText'

describe('OpenStateText', () => {
  it.each([
    [{ kind: 'open', closesAt: 23 * 60 }, 'Open until 23:00', 'text-emerald-700'],
    [{ kind: 'open', closesAt: null }, 'Open 24 hours', 'text-emerald-700'],
    [{ kind: 'opens-soon', opensAt: 19 * 60 + 30 }, 'Opens at 19:30', 'text-amber-700'],
    [{ kind: 'closed', opensAt: 19 * 60 }, 'Closed · opens at 19:00', 'text-gray-600'],
    [{ kind: 'closed-today' }, 'Closed today', 'text-gray-600'],
  ] as const)('%o reads %s', (state, label, tone) => {
    render(<OpenStateText state={state} />)
    expect(screen.getByText(label)).toHaveClass(tone)
  })
})
