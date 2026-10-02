import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { packageDir } from '../../../constants'

export async function devContainerFiles(nodeVersion: string) {
  const config = {
    name: 'pnpm monorepo',
    build: { dockerfile: 'Dockerfile', context: '.' },
    containerUser: 'node',
    remoteUser: 'node',
    updateRemoteUserUID: true,
    mounts: [`source=\${devcontainerId}-pnpm-store,target=/home/node/.local/share/pnpm/store,type=volume`],
    forwardPorts: [],
    postCreateCommand: ['node', '.devcontainer/setup.mjs'],
  }
  const dockerfile = [
    `FROM node:${nodeVersion}-bookworm`,
    '',
    'RUN npm install --global --ignore-scripts corepack@0.36.0 \\',
    '    && corepack enable \\',
    '    && mkdir -p /home/node/.local/share/pnpm/store /home/node/.cache/node/corepack \\',
    '    && chown -R node:node /home/node/.local /home/node/.cache',
    '',
    `ENV REPOCTL_CONTAINER_NODE_VERSION=${nodeVersion}`,
    'ENV PNPM_HOME=/home/node/.local/share/pnpm',
    'ENV npm_config_store_dir=/home/node/.local/share/pnpm/store PNPM_CONFIG_STORE_DIR=/home/node/.local/share/pnpm/store',
    `ENV PATH="/home/node/.local/share/pnpm:\${PATH}"`,
    'ENV COREPACK_ENABLE_AUTO_PIN=0 COREPACK_DEFAULT_TO_LATEST=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
    'USER node',
    '',
  ].join('\n')
  const readme = [
    '# pnpm workspace Dev Container',
    '',
    'Open this workspace with the Dev Containers extension or the Dev Containers CLI when you want to create the container. Generating this preset does not run Docker or install dependencies.',
    '',
    `The image pins Node ${nodeVersion} and installs Corepack 0.36.0. Corepack enables pnpm and setup checks the exact version declared by the current root packageManager. Installation uses the frozen lockfile when present and enforces engines; a failed step stops setup.`,
    '',
    'The container uses the non-root node user. Its pnpm store lives in a named volume outside the source checkout. Keep the store mount separate from your sources. If your host and container use different platforms, use a separate checkout and do not share installed node_modules across those platforms.',
    '',
    'Add application ports to forwardPorts in devcontainer.json, for example [3000, 5173]. No ports are forwarded by default. Start development services explicitly after setup.',
    '',
    'From the container workspace root run pnpm build, pnpm lint, pnpm typecheck, pnpm test and pnpm exec repo doctor. Source-only repoctl test scripts are not required in generated projects.',
    '',
    'Existing configurations are preserved by repoctl. Review a fresh repo tooling devcontainer plan after changing engines or the image. Edit your configuration deliberately when adopting a different preset; apply never overwrites your existing files.',
    '',
    'If application is interrupted, inspect .repoctl/devcontainer.lock and any .repoctl-upgrade-*.tmp files under .devcontainer. Verify that no writer is active, preserve concurrent edits and reconcile partial files before removing the stale lock and generating a fresh plan.',
    '',
    'Reference: https://containers.dev/implementors/json_reference/ and https://github.com/devcontainers/templates/tree/main/src/typescript-node',
    '',
  ].join('\n')
  return new Map([
    ['.devcontainer/devcontainer.json', `${JSON.stringify(config, null, 2)}\n`],
    ['.devcontainer/Dockerfile', dockerfile],
    ['.devcontainer/setup.mjs', await readFile(path.join(packageDir, 'resources/devcontainer/setup.mjs'), 'utf8')],
    ['.devcontainer/README.md', readme],
  ])
}
