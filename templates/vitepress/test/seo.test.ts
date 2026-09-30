import type { TransformContext } from 'vitepress'
import { expect, it } from 'vitest'
import { faqContent } from '../.vitepress/home/faq'
import { createPageHead } from '../.vitepress/seo'

it.each([['index.md', 'en'], ['zh/index.md', 'zh']] as const)('renders valid FAQ structured data for %s', (page, locale) => {
  const head = createPageHead({ page, title: 'repoctl', description: 'A </script> description' } as TransformContext)
  const script = head.find(([tag, attrs]) => tag === 'script' && attrs.type === 'application/ld+json')!
  const content = script[2]!
  expect(content).not.toContain('</script>')
  const schema = JSON.parse(content)
  const faq = schema['@graph'].find((item: { '@type': string }) => item['@type'] === 'FAQPage')
  expect(faq.mainEntity.map((item: { name: string, acceptedAnswer: { text: string } }) => [item.name, item.acceptedAnswer.text])).toEqual(faqContent[locale])
})

it('keeps homepage FAQ data off documentation pages', () => {
  const head = createPageHead({ page: 'reference/commands.md', title: 'Commands', description: 'Commands' } as TransformContext)
  expect(head.find(([tag]) => tag === 'script')![2]).not.toContain('FAQPage')
})
