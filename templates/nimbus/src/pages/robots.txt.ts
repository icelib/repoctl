import { withBase } from '@cloudflare/nimbus-docs/runtime'
import { docsRobots } from 'repoctl/docs-context'
import { deployment } from '../lib/deployment'

export const prerender = true

export function GET() {
  const body = docsRobots(deployment, new URL(withBase('/sitemap-index.xml', import.meta.env.BASE_URL), deployment.origin).href)

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
