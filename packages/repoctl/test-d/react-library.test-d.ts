import { templateMap } from 'repoctl'
import { expectType } from 'tsd'

expectType<'react-lib'>(templateMap['react-lib'].source)
expectType<'packages/react-lib'>(templateMap['react-lib'].target)
