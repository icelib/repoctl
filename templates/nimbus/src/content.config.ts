import { docsCollection } from '@cloudflare/nimbus-docs/content'
import { defineCollection } from 'astro:content'

export const collections = {
  docs: defineCollection(docsCollection()),
}
