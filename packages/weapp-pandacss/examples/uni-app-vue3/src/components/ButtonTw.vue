<template>
  <view :class="className">
    <slot></slot>
  </view>
</template>

<script lang="ts">
// tailwindcss
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { cva } from "class-variance-authority";
import type { VariantProps } from 'class-variance-authority'
const button = cva(["font-semibold", "border", "rounded"], {
  variants: {
    intent: {
      primary: [
        "bg-blue-500",
        "text-white",
        "border-transparent",
        "hover:bg-blue-600",
      ],
      // **or**
      // primary: "bg-blue-500 text-white border-transparent hover:bg-blue-600",
      secondary: [
        "bg-white",
        "text-gray-800",
        "border-gray-400",
        "hover:bg-gray-100",
      ],
    },
    size: {
      small: ["text-sm", "py-1", "px-2"],
      medium: ["text-base", "py-2", "px-4"],
    },
  },
  compoundVariants: [
    {
      intent: "primary",
      size: "medium",
      class: "uppercase",
    },
  ],
  defaultVariants: {
    intent: "primary",
    size: "medium",
  },
});

type StyleProps = VariantProps<typeof button>

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