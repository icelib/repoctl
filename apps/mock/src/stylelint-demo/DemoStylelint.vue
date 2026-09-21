<script setup lang="ts">
</script>

<template>
  <section class="demo-shell">
    <article class="demo-shell__card">
      <p class="demo-shell__copy">
        Open the GitHub docs from your IDE to compare pass/fail stylelint cases.
      </p>
      <ul class="demo-shell__links">
        <li>
          <a
            href="https://github.com/icelib/repoctl/blob/main/apps/mock/src/stylelint-demo/README.md"
            target="_blank"
            rel="noreferrer"
          >
            stylelint demo overview
          </a>
        </li>
        <li>
          <a
            href="https://github.com/icelib/repoctl/blob/main/apps/mock/src/stylelint-demo/demo-css.md"
            target="_blank"
            rel="noreferrer"
          >
            selector demo guide
          </a>
        </li>
        <li>
          <a
            href="https://github.com/icelib/repoctl/blob/main/apps/mock/src/stylelint-demo/demo-scss.md"
            target="_blank"
            rel="noreferrer"
          >
            scss and @apply demo guide
          </a>
        </li>
        <li>
          <a
            href="https://github.com/icelib/repoctl/blob/main/apps/mock/src/stylelint-demo/demo-vue.md"
            target="_blank"
            rel="noreferrer"
          >
            vue sfc demo guide
          </a>
        </li>
        <li>
          <a
            href="https://github.com/icelib/repoctl/blob/main/apps/mock/src/stylelint-demo/demo-unocss.md"
            target="_blank"
            rel="noreferrer"
          >
            unocss demo guide
          </a>
        </li>
        <li>
          <a
            href="https://github.com/icelib/repoctl/blob/main/apps/mock/src/stylelint-demo/demo-formatting.md"
            target="_blank"
            rel="noreferrer"
          >
            safe formatting demo guide
          </a>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
/* stylelint-disable unocss/no-atomic-class, unocss/no-invalid-apply, unocss/no-apply, unocss/no-arbitrary-value */
.demo-shell {
  padding: 20px;
}

.demo-shell__card {
  border: 1px solid #ddd;
}

.demo-shell__copy {
  margin: 0 0 12px;
}

.demo-shell__links {
  padding-left: 20px;
}

.demo-shell__links a {
  color: #0f62fe;
  text-decoration: underline;
}

.demo-shell__title {
  text-align: left;
}

/* stylelint-disable selector-class-pattern, comment-empty-line-before */
/* should report: tailwindcss/no-atomic-class */
.text-center {
  text-align: center;
}

/* should report: tailwindcss/no-atomic-class */
.sm\:hidden {
  display: none;
}

/* should report: tailwindcss/no-atomic-class and tailwindcss/no-arbitrary-value */
.w-\[10px\] {
  width: 10px;
}
/* stylelint-enable selector-class-pattern, comment-empty-line-before */
/* stylelint-enable unocss/no-atomic-class, unocss/no-invalid-apply, unocss/no-apply, unocss/no-arbitrary-value */
</style>

<style lang="scss" scoped>
/* stylelint-disable unocss/no-atomic-class, unocss/no-invalid-apply, unocss/no-apply, unocss/no-arbitrary-value */
.demo-stack {
  gap: 12px;
}

.demo-stack__item {
  justify-content: space-between;
}

/* stylelint-disable comment-empty-line-before */
/* should report: tailwindcss/no-apply */
.demo-stack--applied {
  @apply justify-between;
}
/* stylelint-enable comment-empty-line-before */

/* stylelint-disable selector-class-pattern, comment-empty-line-before */
/* should report: tailwindcss/no-atomic-class */
.justify-between {
  justify-content: space-between;
}

/* should report: tailwindcss/no-atomic-class */
.lg\:grid {
  display: grid;
}

/* should report: tailwindcss/no-atomic-class and tailwindcss/no-arbitrary-value */
.\[mask-type\:luminance\] {
  mask-type: luminance;
}
/* stylelint-enable selector-class-pattern, comment-empty-line-before */
/* stylelint-enable unocss/no-atomic-class, unocss/no-invalid-apply, unocss/no-apply, unocss/no-arbitrary-value */
</style>
