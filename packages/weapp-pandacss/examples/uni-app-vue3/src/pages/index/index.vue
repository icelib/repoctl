<template>
  <view class="content">

    <view class="text-area pb-2">
      <text class="title" :class="css({
        bg: 'red.400',
        '&:hover': {
          bg: 'orange.400'
        }
      })">{{ title }}</text>
    </view>
    <view :class="[style0, aaa]">aaa</view>
    <div :class="styles">
      <p>Hello World</p>
    </div>
    <view class="flex justify-around w-full">
      <IceButtonTw>asdfg</IceButtonTw>
      <IceButtonPanda>zxcvb</IceButtonPanda>
    </view>

  </view>
</template>

<script setup lang="ts">
import IceButtonTw from '@/components/ButtonTw.vue'
import IceButtonPanda from '@/components/ButtonPanda.vue'
import { css } from 'styled-system/css'
import { ref } from 'vue'
const title = ref('Hello')
const aaa = css({
  color: 'red.300',
  bg: 'blue.800',
  fontWeight: 'semibold'
})

const styles = css({
  backgroundColor: 'gainsboro',
  borderRadius: '9999px',
  fontSize: 'lg',
  padding: '10px 15px'
})

const style0 = css({
  fontSize: '2xl',
  paddingTop: '10px'
})

</script>

<style>
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 200rpx;
  width: 200rpx;
  margin-top: 200rpx;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 50rpx;
}

.text-area {
  display: flex;
  justify-content: center;
}

.title {
  font-size: 36rpx;
  color: #8f8f94;
}
</style>
