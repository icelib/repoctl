import { expectType } from 'tsd'
import { parsePublishSummary, publishStable } from '..'

type ReleaseOptions = Parameters<typeof publishStable>[0]
const options: ReleaseOptions = { cwd: '.', sleep: async (_milliseconds: number) => {} }
expectType<Promise<Array<{ name: string, version: string }>>>(publishStable(options))
expectType<Array<{ name: string, version: string }>>(parsePublishSummary('{"publishedPackages":[]}'))
