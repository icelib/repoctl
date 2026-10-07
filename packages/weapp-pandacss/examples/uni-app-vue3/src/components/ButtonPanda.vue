<template>
  <view :class="className">
    <slot></slot>
  </view>
</template>

<script lang="ts">
// tailwindcss
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { cva } from "styled-system/css";
import type { RecipeVariantProps } from 'styled-system/css'
const button = cva({
  base: {
    fontWeight: 'semibold',
    borderWidth: '1px',
    rounded: 'md'
  },
  variants: {
    intent: {
      primary: {
        bg: 'blue.500',
        color: 'white',
        borderColor: 'transparent',
        _hover: {
          bg: 'blue.600'
        }
      },
      secondary: {
        bg: 'white',
        color: 'gray.800',
        borderColor: 'gray.400',
        _hover: {
          bg: 'gray.100'
        }
      }
    },
    size: {
      small: {
        fontSize: 'sm',
        py: '1',
        px: '2'
      },
      medium: {
        fontSize: 'md',
        py: '2',
        px: '4'
      }
    }

  },
  compoundVariants: [
    {
      intent: "primary",
      size: "medium",
      css: {
        textTransform: 'uppercase'
      }
    },
  ],
  defaultVariants: {
    intent: "primary",
    size: "medium",
  }
});

type StyleProps = RecipeVariantProps<typeof button>

export default defineComponent({
  props: {
    intent: {
      type: [String] as PropType<StyleProps['intent']>
    },
    size: {
      type: [String] as PropType<StyleProps['size']>
    }
  },
  setup(props) {
    return {
      className: button({
        intent: props.intent,
        size: props.size
      })
    }
  }
})



</script>

<style scoped></style>