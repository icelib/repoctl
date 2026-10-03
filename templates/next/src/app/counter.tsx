'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <section className="counter" aria-label="Client interaction">
      <div>
        <p className="eyebrow">Client state</p>
        <output aria-label="Count" aria-live="polite">{count}</output>
      </div>
      <div className="actions">
        <button type="button" onClick={() => setCount(value => value + 1)}>Add one</button>
        <button type="button" className="secondary" disabled={count === 0} onClick={() => setCount(0)}>Reset</button>
      </div>
    </section>
  )
}
