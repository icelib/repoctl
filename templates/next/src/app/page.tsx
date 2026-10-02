import Counter from './counter'

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">repoctl / Next.js</p>
      <h1>Next.js workspace</h1>
      <p className="intro">A server-rendered page with a small client component. Ready for your next feature.</p>
      <Counter />
      <footer>
        <a href="/api/health">Health endpoint</a>
        <a href="https://nextjs.org/docs/app">App Router documentation</a>
      </footer>
    </main>
  )
}
