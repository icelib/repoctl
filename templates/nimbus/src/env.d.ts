// Astro checks component props through its generated TSX representation.
// Plain tsc needs the runtime module shape for imports in src/components.ts.
declare module '*.astro' {
  const component: import('astro/runtime/server/index.js').AstroComponentFactory
  export default component
}
