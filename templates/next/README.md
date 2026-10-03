# Next.js App Router workspace

This TypeScript template follows `create-next-app@16.3.8`'s App Router layout and uses the shared repoctl tooling. It includes a server page, a client counter and `GET /api/health`. It requires Node 22.13 or newer and shares the workspace's pnpm version and lockfile.

Run these from the generated workspace root:

```sh
corepack enable
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --dir apps/next start
```

For development, run `pnpm --dir apps/next dev`. When created with `repo new portal --template next`, use `apps/portal` instead. Lint runs ESLint and Stylelint independently of Next build. `typecheck` runs `next typegen` before `tsc --noEmit`, so route types exist even before the first production build. Unit tests cover client state; the repoctl source repository also tests the built server and browser using actual published tarballs.

## Internal packages

For a compiled workspace library, add `"@acme/shared": "workspace:*"` to dependencies and import its public package name. The library should expose its built JavaScript and declaration files through `exports`. Turbo's inherited `^build` builds the library first; do not reach into another package's source via relative imports.

To consume an intentionally source-exporting TypeScript package, add its package name to `transpilePackages` in `next.config.ts`. Its exports and server/client compatibility must support the target environment. `transpilePackages` does not generate that library's standalone declaration files, and server-only code must not enter a client component. The packaged acceptance test covers both compiled and source-exporting internal packages.

## Cache and runtime boundaries

The local `turbo.json` includes all authored app inputs and caches `.next/**` except `.next/cache/**`. Development and production server tasks are persistent and uncached; type generation is uncached to keep Next's generated route declarations available. `.next`, `next-env.d.ts`, and TypeScript build info are generated locally and never shipped as template inputs.

No external font download is needed to build this starter. Configure environment values and production hosting for your application separately; no authentication, database or deployment platform is included.

References: [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app), [Next CLI and typegen](https://nextjs.org/docs/app/api-reference/cli/next), [transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages).
