import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <p className="eyebrow">Your next idea starts here</p>
      <h1>Make something useful.</h1>
      <p className="intro">A small React workspace with room to grow.</p>
      <section className="counter" aria-labelledby="counter-title">
        <h2 id="counter-title">Try an interaction</h2>
        <output aria-label="Count" aria-live="polite">{count}</output>
        <div className="actions">
          <button type="button" onClick={() => setCount(value => value + 1)}>Add one</button>
          <button type="button" className="secondary" disabled={count === 0} onClick={() => setCount(0)}>Reset</button>
        </div>
      </section>
      <p className="footnote">Built with React, TypeScript, and Vite.</p>
    </main>
  )
}
