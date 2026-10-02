# React component library

An ESM-only React 19.3+ component library. `Counter` and `CounterProps` are exported
from the package root, and styles have an explicit `./style.css` export. React,
React DOM and their subpaths (including JSX runtimes) remain external to the bundle.
CommonJS is not a supported entry point.
The built JavaScript retains `use client`, so Next App Router Server Components
can import this stateful component directly. Callback props still belong in a
consumer Client Component.

```tsx
import type { CounterProps } from 'your-package-name'
import { Counter } from 'your-package-name'
import 'your-package-name/style.css'

const props: CounterProps = { initialCount: 2, step: 2 }
export function Example() {
  return <Counter {...props} onCountChange={console.log} />
}
```

Install `react` and `react-dom` in the consuming application. Import the stylesheet
once in its application entry. `sideEffects` preserves CSS during tree shaking;
JavaScript does not automatically inject styles. `initialCount` initializes the
local state and supplies the reset value; this component is uncontrolled.

Run these commands from the workspace root, replacing the filter if you rename
the package. Build before running the tests: they import the built package entry.

```bash
pnpm --filter @icebreakers/react-lib-template build
pnpm --filter @icebreakers/react-lib-template lint
pnpm --filter @icebreakers/react-lib-template typecheck
pnpm --filter @icebreakers/react-lib-template tsd
pnpm --filter @icebreakers/react-lib-template test
```

The generated package starts with `private: true`. Before publishing, set your own
package name and version, remove `private` (or set it to `false`), review the MIT
license and run `repo package check` from the workspace root. Only `dist`, this
README, the license and the package manifest are packed. Validate a tarball in a
separate application before publishing. Storybook can be added independently;
it is not required to build or consume this library.

## 中文说明

此模板提供 React 19.3+ 的 ESM 组件库，默认目录为 `packages/react-lib`。
组件和 props 类型从包根入口导入，样式从 `包名/style.css` 显式导入。
React、React DOM 和 JSX runtime 不打进库；消费应用需要安装对应 peer 依赖。
默认保留 `private: true`，发布前请修改包名、版本和 private，完成上述构建、
ESLint/Stylelint、类型及行为验证，再执行 `repo package check` 和实际 tarball 消费验证。
本模板不声明 CommonJS 支持，Storybook 是可选扩展。
