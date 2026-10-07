import { styled } from '@linaria/react'
import { css } from '@linaria/core'
import { View, ViewProps } from '@tarojs/components'
import { linearGradient } from 'polished/dist/polished.cjs'
import React from 'react'
import './index.scss'

declare type Component<TProps> =
  | ((props: TProps) => any)
  | {
      new (props: TProps): any
    }

type VPS = ViewProps & { style?: React.CSSProperties }
type TP = VPS & { color: string }
const Title = styled<TP, VPS, Component<TP>>(View)`
  color: ${(props) => props.color};
`

const absoluteFill = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
}

// {
//   ${linearGradient({
//     colorStops: ['#00FFFF 0%', 'rgba(0, 0, 255, 0) 50%', '#0000FF 95%'],
//     toDirection: 'to top right',
//     fallback: '#FFF'
//   })}
// }
/*background: blue;*/
// Cannot use import statement outside a module in
// 只能用 cjs 方式去加载吗？
// esm 不支持？为什么会加载到 polished.esm.js 了呢？

const style = css`
  color: yellow;
  ${absoluteFill}
  ${linearGradient({
    colorStops: ['#00FFFF 0%', 'rgba(0, 0, 255, 0) 50%', '#0000FF 95%'],
    toDirection: 'to top right',
    fallback: '#FFF'
  })}
`

const Index: React.FC = () => {
  return (
    <>
      <Title color='red'>Hello World!</Title>
      <View className={style}>style</View>
    </>
  )
}

export default Index
