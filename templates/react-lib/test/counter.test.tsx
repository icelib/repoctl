import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Counter } from '..'

afterEach(cleanup)

it('uses the built public entry to update, notify and reset the initial value', () => {
  const onCountChange = vi.fn()
  render(<Counter label="Items" initialCount={3} step={2} onCountChange={onCountChange} />)
  const count = screen.getByLabelText('Items')
  const reset = screen.getByRole('button', { name: 'Reset' })
  expect(count.textContent).toBe('3')
  expect(reset.hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Increase' }))
  expect(count.textContent).toBe('5')
  expect(onCountChange).toHaveBeenLastCalledWith(5)
  fireEvent.click(reset)
  expect(count.textContent).toBe('3')
  expect(onCountChange).toHaveBeenLastCalledWith(3)
})

it('prevents changes when disabled', () => {
  const onCountChange = vi.fn()
  render(<Counter disabled onCountChange={onCountChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Increase' }))
  expect(screen.getByLabelText('Count').textContent).toBe('0')
  expect(onCountChange).not.toHaveBeenCalled()
})
