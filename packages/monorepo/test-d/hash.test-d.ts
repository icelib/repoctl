import { Buffer } from 'node:buffer'
import { getFileHash, isFileChanged } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

expectType<string>(getFileHash('content'))
expectType<string>(getFileHash(Buffer.from('content')))
expectType<string>(getFileHash(new ArrayBuffer(8)))
expectType<string>(getFileHash(new SharedArrayBuffer(8)))
expectType<string>(getFileHash(new Uint8Array(8)))
expectType<string>(getFileHash(new Uint8Array(new SharedArrayBuffer(8))))
expectType<string>(getFileHash(new DataView(new ArrayBuffer(8))))
expectType<boolean>(isFileChanged(new ArrayBuffer(8), new SharedArrayBuffer(8)))
expectType<boolean>(isFileChanged(new DataView(new SharedArrayBuffer(8)), Buffer.from('content')))
expectError(getFileHash(42))
expectError(isFileChanged('content', {}))
