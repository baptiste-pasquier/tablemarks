import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('renders the app name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Tablemarks' })).toBeInTheDocument()
  })
})
