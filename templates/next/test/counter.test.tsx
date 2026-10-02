import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import Counter from '../src/app/counter'

afterEach(cleanup)

it('increments the count and resets it to zero', () => {
  render(<Counter />)
  const count = screen.getByLabelText('Count')
  const reset = screen.getByRole('button', { name: 'Reset' })
  expect(count.textContent).toBe('0')
  expect(reset.hasAttribute('disabled')).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Add one' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add one' }))
  expect(count.textContent).toBe('2')
  expect(reset.hasAttribute('disabled')).toBe(false)

  fireEvent.click(reset)
  expect(count.textContent).toBe('0')
  expect(reset.hasAttribute('disabled')).toBe(true)
})
