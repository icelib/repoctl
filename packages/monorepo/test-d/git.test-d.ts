import type { Context, GitUrlMetadata } from '@icebreakers/monorepo'
import { GitClient } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

const client = new GitClient()
expectType<Promise<GitUrlMetadata | undefined>>(client.getGitUrl())
expectType<GitUrlMetadata | undefined>({} as Context['gitUrl'])

const metadata = {} as GitUrlMetadata
expectType<string>(metadata.source)
expectType<string>(metadata.owner)
expectType<string>(metadata.name)
expectType<string>(metadata.ref)
expectType<string>(metadata.filepath)
expectType<string>(metadata.filepathtype)
expectType<string>(metadata.full_name)
expectType<string>(metadata.organization)
expectType<boolean | undefined>(metadata.git_suffix)
expectType<string>(metadata.hash)
expectType<string>(metadata.host)
expectType<string>(metadata.href)
expectType<string>(metadata.password)
expectType<boolean>(metadata.parse_failed)
expectType<string>(metadata.pathname)
expectType<string>(metadata.port)
expectType<string>(metadata.protocol)
expectType<string[]>(metadata.protocols)
expectType<Record<string, string>>(metadata.query)
expectType<string>(metadata.resource)
expectType<string>(metadata.search)
expectType<string>(metadata.user)
expectType<string>(metadata.token)
expectType<string>(metadata.toString())
expectType<string>(metadata.toString('https'))
