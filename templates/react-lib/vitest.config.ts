import { defineVitestProjectConfig } from 'repoctl/tooling'

export default await defineVitestProjectConfig({
  options: { environment: 'jsdom' },
})
