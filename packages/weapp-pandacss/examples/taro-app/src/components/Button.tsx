import { Button } from '@tarojs/components'
import { styled } from 'styled-system/jsx'
import { cx, cva, RecipeVariantProps } from 'styled-system/css'
import type { PropsWithChildren } from 'react'

const styleButton = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  variants: {
    visual: {
      solid: { bg: 'red.200', color: 'white' },
      outline: { borderWidth: '1px', borderColor: 'red.200' }
    },
    size: {
      sm: { padding: '1', fontSize: '20px' },
      lg: { padding: '2', fontSize: '24px' }
    }
  },
  defaultVariants: {
    size: 'sm',
    visual: 'solid'
  }
})

const StyledButton = styled(Button)

export type IceButtonProps = PropsWithChildren<
  {
    className?: string
  } & RecipeVariantProps<typeof styleButton>
>

export default function IceButton(props: IceButtonProps) {
  return (
    <StyledButton
      className={cx(
        styleButton({
          size: props.size,
          visual: props.visual
        }),
        props.className
      )}
    >
      {props.children}
    </StyledButton>
  )
}
