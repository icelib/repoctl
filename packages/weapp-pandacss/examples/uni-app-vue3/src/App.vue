<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
onLaunch(() => {
  console.log("App Launch");
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style lang="scss">
@layer reset,
base,
tokens,
recipes,
utilities;

@import 'tailwindcss/base';
@import 'tailwindcss/utilities';
@import 'tailwindcss/components';
</style>
