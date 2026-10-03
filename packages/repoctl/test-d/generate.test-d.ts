import type { GeneratePlan, GenerateResult } from 'repoctl'
import { applyGeneratePlan, planGenerate } from 'repoctl'
import { expectType } from 'tsd'

const plan = planGenerate({ cwd: '.', package: 'packages/server', generator: 'hono-route', parameters: { name: 'health' } })
expectType<Promise<GeneratePlan>>(plan)
void plan.then(value => expectType<Promise<GenerateResult>>(applyGeneratePlan(value)))
