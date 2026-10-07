import { Cell, Button as NButton } from '@nutui/nutui-react-taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { css, cx } from 'styled-system/css'
import { escape } from 'styled-system/weapp-panda'
import { styled } from 'styled-system/jsx'
import IceButton from '@/components/Button'
import './index.scss'

const StyledView = styled(View)

const cardStyles = css({
  borderWidth: '1px',
  borderRadius: '8px',
  paddingX: '12px',
  paddingY: '24px',
})

function Card({ className, ...props }) {
  const rootClassName = cx(cardStyles, className)
  return <View className={rootClassName} {...props} />
}

const styles = css({
  backgroundColor: 'gainsboro',
  borderRadius: '9999px',
  fontSize: '13px',
  padding: '10px 15px',
})

const styles0 = css({
  bg: 'gainsboro',
  rounded: '9999px',
  fontSize: '13px',
  p: '10px 15px',
})
export default function Index() {
  useLoad(() => {
    console.log('Page loaded.')
  })

  const items = [1, 2, 3, 4, 5, 6]
  const textContent
    = '`1234567890-= ~!@#$%^&*()_+ qwertyuiop[]\\ QWERTYUIOP{}| asdfghjkl;\' ASDFGHJKL:" zxcvbnm,./ ZXCVBNM<>?'
  const a = { b: 1 }
  const aaa = escape(textContent)
  console.log(a?.b)
  return (
    // nutui 样式错乱？
    <View>
      <View
        className={css({
          fontSize: 'xs',
          fontWeight: 'semibold',
        })}
      >
        {aaa}
      </View>

      <IceButton>11</IceButton>
      <IceButton
        size="lg"
        visual="outline"
        className={css({
          color: 'pink.500',
        })}
      >
        11
      </IceButton>
      <StyledView bg="blue.500">StyledView</StyledView>
      <Cell title="我是标题" description="我是描述" extra="描述文字" />
      <View>
        <NButton openType="share">分享给好友</NButton>
        <NButton openType="openSetting">打开授权设置页</NButton>
        <NButton type="primary">主要按钮</NButton>
        <NButton type="info">信息按钮</NButton>
        <NButton type="default">默认按钮</NButton>
        <NButton type="danger">危险按钮</NButton>
        <NButton type="warning">警告按钮</NButton>
        <NButton type="success">成功按钮</NButton>
      </View>

      <View
        className={css({
          color: 'red.400',
          bg: 'amber.800',
        })}
      >
        <Text>Hello world!</Text>
      </View>
      <Text className={styles}>Text</Text>
      <Text className={styles0}>Text</Text>
      <Text className="aaa">aaa</Text>
      <Button className="button">Button</Button>
      <Button className="button--variant-primary">Button</Button>

      <View
        className={css({
          'bg': 'red.400',
          'h': '10',
          '&:hover': {
            bg: 'orange.400',
          },
        })}
      >
        112323
      </View>

      <View
        className={css({
          bg: 'blue.400',
          h: '10',
          _hover: {
            bg: 'yellow.400',
          },
        })}
      >
        112323
      </View>

      <View
        className={css({
          'bg': 'red.400',
          'mt': '4',
          '& text': {
            color: 'gray.100',
          },
        })}
      >
        <Text>pinkpink</Text>
      </View>
      <Card
        className={css({
          bg: 'cyan.800',
        })}
      >
        啊啊啊啊啊啊啊啊
      </Card>
      <View
        className={css({
          bg: { base: 'red.500', _hover: 'red.700' },
        })}
      >
        大大说
      </View>
      <View
        className={css({
          bg: { base: 'red.500', _hover: { _focus: 'red.700' } },
        })}
      >
        大大说
      </View>

      {/* <View
        className={css({
          '&[data-state=closed]': { color: 'red.300' },
          '& > *': { margin: '2' }
        })}
      /> */}

      <View
        className={css({
          bg: 'red.500',
          _hover: { bg: 'red.700' },
          _active: { bg: 'red.900' },
        })}
      >
        Hover me
      </View>

      <Text>
        {items.map(item => (
          <Text key={item} className={css({ _first: { color: 'red.500' } })}>
            {item}
          </Text>
        ))}
      </Text>
      <Text>
        {items.map(item => (
          <Text
            key={item}
            className={css({
              _even: { bg: 'blue' },
              _odd: { bg: 'red' },
            })}
          >
            {item}
          </Text>
        ))}
      </Text>

      <View
        className={css({
          _before: { content: '"👋"' },
        })}
      >
        Hello
      </View>

      <Input
        placeholder="Enter your name"
        className={css({
          _placeholder: { color: 'green.700' },
        })}
      >
      </Input>
      <View
        className={css({
          _motionReduce: { transition: 'none' },
          _motionSafe: { transition: 'all 0.3s' },
        })}
      >
        Hello
      </View>

      <View
        className={css({
          bg: 'black',
          _osDark: { bg: 'white' },
        })}
      >
        Hello
      </View>

      <View
        className={css({
          bg: 'white',
          _highContrast: { bg: 'black' },
        })}
      >
        Hello
      </View>

      <View
        className={css({
          pb: '4',
          _portrait: { pb: '8' },
        })}
      >
        Hello
      </View>

      <View className="group">
        <Text className={css({ _groupHover: { bg: 'red.500' } })}>
          Hover me
        </Text>
      </View>

      <View>
        <Text className="peer">Hover me</Text>
        <Text className={css({ _peerHover: { bg: 'red.500' } })}>
          I'll change by bg
        </Text>
      </View>

      {/* <View dir='ltr'>
        <View
          className={css({
            _ltr: { ml: '3' },
            _rtl: { mr: '3' }
          })}
        >
          Hello
        </View>
      </View> */}

      <View
        data-loading
        className={css({
          _loading: { bg: 'gray.500' },
        })}
      >
        Hello
      </View>

      {/* <dViewiv
        data-orientation='horizontal'
        className={css({
          _horizontal: { bg: 'red.500' },
          _vertical: { bg: 'blue.500' }
        })}
      >
        Hello
      </dViewiv> */}

      <View className="px-4 py-1 text-center bg-slate-400">TAILWIND</View>
    </View>
  )
}
