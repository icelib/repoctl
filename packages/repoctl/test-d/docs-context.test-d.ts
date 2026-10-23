import type { DocsChannel, DocsContext, DocsContextOptions } from 'repoctl/docs-context'
import { docsPreviewRobots, docsRobots, mergeDocsHeaders, resolveDocsContext } from 'repoctl/docs-context'
import { expectNotAssignable, expectType } from 'tsd'

const options: DocsContextOptions = { previewOrigin: 'https://preview.example.com', stableOrigin: 'https://docs.example.com', channel: undefined, url: undefined }
const context = resolveDocsContext(options)
expectType<DocsContext>(context)
expectType<DocsChannel>(context.channel)
expectType<boolean>(context.preview)
expectType<string>(context.origin)
expectType<string>(context.stableOrigin)
expectType<string>(docsRobots(context))
expectType<string>(docsRobots(context, 'https://docs.example.com/sitemap-index.xml'))
expectType<string>(mergeDocsHeaders('', context))
expectType<'noindex, nofollow, noarchive'>(docsPreviewRobots)
expectNotAssignable<DocsContextOptions>({ previewOrigin: 'https://preview.example.com' })
expectNotAssignable<DocsContextOptions>({ ...options, channel: 1 })
expectNotAssignable<keyof DocsContextOptions>('token')
