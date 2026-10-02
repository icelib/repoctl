import type { ComponentProps, ReactElement } from 'react'
import type { CounterProps } from '..'
import { createElement } from 'react'
import { expectAssignable, expectError, expectType } from 'tsd'
import { Counter } from '..'

expectAssignable<CounterProps>({ initialCount: 2, step: 3, onCountChange: count => expectType<number>(count) })
expectAssignable<ComponentProps<typeof Counter>>({ label: 'Items', disabled: true })
expectAssignable<ReactElement<CounterProps>>(createElement(Counter, { initialCount: 2 }))
expectError(createElement(Counter, { initialCount: '2' }))
expectError(createElement(Counter, { onCountChange: (value: string) => value }))
