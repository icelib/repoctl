# React application

A small React and TypeScript SPA built with Vite. It includes an accessible counter, a Vitest interaction test, and the workspace's shared ESLint and Stylelint configuration.

From the workspace root, enable the declared package manager and install dependencies:

```sh
corepack enable
pnpm install
```

Run these commands from this application directory:

```sh
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm preview
```

`build` creates `dist/`; `preview` serves that production output locally. `lint` checks both code and CSS. `typecheck` uses TypeScript project references for the app, tests, and Vite configuration.

To consume another workspace package, add it as a `workspace:*` dependency, import its package name, and build its public output first. Running `pnpm build` at the workspace root lets Turbo order dependency builds. Do not import another package's `src/` directory.

Router, state management, backend, and CSS framework choices are left to your application.
