// import 'core-js'
import type { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import './app.css'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
    console.log(`[TARO_ENV]:`, process.env.TARO_ENV)
  })

  // children 是将要会渲染的页面
  return children
}

export default App
