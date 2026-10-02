import { useState } from 'react'
import './style.css'

export interface CounterProps {
  /** Accessible name for this counter's current value. */
  label?: string
  /** Initial value, also used by the reset action. */
  initialCount?: number
  step?: number
  disabled?: boolean
  onCountChange?: (count: number) => void
}

export function Counter({ label = 'Count', initialCount = 0, step = 1, disabled = false, onCountChange }: CounterProps) {
  const [count, setCount] = useState(initialCount)
  function update(next: number) {
    setCount(next)
    onCountChange?.(next)
  }

  return (
    <div className="repoctl-counter">
      <output aria-label={label} aria-live="polite">{count}</output>
      <button type="button" disabled={disabled} onClick={() => update(count + step)}>Increase</button>
      <button type="button" disabled={disabled || count === initialCount} onClick={() => update(initialCount)}>Reset</button>
    </div>
  )
}
