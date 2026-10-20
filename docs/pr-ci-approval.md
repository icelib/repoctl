# PR 检查审批

维护者通过选择批准哪些 PR，把并发资源集中到当前关注、准备推进合并的 PR。已批准 PR 保持完整的适用矩阵，不设置全仓串行锁或固定活跃 PR 数量，也不启动 runner 轮询其他任务。

## 原生 PR 检查

本源码仓库的正常验证由 `pull_request` 触发：创建、更新、重新打开、转为 ready，以及增删 `release:major` / `release:minor` 标签，都会创建等待 `pr-ci` 环境审批的 **PR Checks** 运行。草稿 PR 跳过全部 job，转为 ready 后才产生可批准的运行。

批准前不分配 runner，不 checkout、不安装依赖，也不构建或测试。每次运行只需批准一次。作者需提前执行 `pnpm change` 并提交所需 changeset；变更发布级别标签时，也要同步 changeset。准备、验证和汇总全程只读，不自动生成 changeset，不提交代码，也不评论 PR。

原生准备与汇总代码检出事件固定的 `github.sha`（测试 merge 提交），不使用会漂移的基础分支名称。批准后，准备阶段核对事件中的 head/base、发布级别标签快照、实际分支提交及合并候选的双亲，固定 head、目标分支名称、base、发布级别标签和测试 merge SHA；发现提交、标签或合并候选不匹配立即停止。**Release Intent** 先检查发布意图，缺少 changeset 时提示 `pnpm change` 并停止后续重型任务。通过后，再按原有路径筛选并行运行完整的 6 个系统与 Node 组合及 2 个 Dev Container 架构。执行候选代码的任务只有读取权限。

GitHub 原生 checks 逐项展示任务的排队、运行和最终状态。最终只读 job **PR Validation** 检查各任务结果及当前 PR 的 head/base 和发布级别标签，普通 PR 不再回写 commit status。适用检查失败时汇总失败；路径不适用的矩阵可以跳过。

普通标签变化的运行会跳过全部 job，并使用独立并发组，避免取消已批准的检查。同一 PR 的新提交、发布级别标签变化或默认分支手动诊断会取消旧运行。`pull_request_target` 仅响应关闭、合并或转回草稿，使用原 PR 的并发组取消旧运行，全部 job 跳过。普通标签、草稿和关闭/转草稿的全跳过运行，其汇总 job 名称为 **Ignored PR event**，不会创建同名的 **PR Validation** 来干扰有效检查。重新打开或转为 ready 后需要重新批准。

取消后不启动后续验证或汇总；GitHub 停止正在运行的进程仍需短暂收尾。取消的运行不能作为完成验证的依据。原生运行获批后，准备失败或后续检查失败都会运行只读的失败汇总，避免准备失败却留下成功门禁；汇总最多运行 5 分钟。

## 环境与事件策略

在 **Settings → Environments** 创建 `pr-ci`，打开 **Required reviewers**，添加 `sonofmagic`，关闭 **Prevent self-review**，允许使用同一身份创建 PR 和批准检查。关闭 **Allow administrators to bypass configured protection rules**。审批任务在 GitHub 确认批准之前等待，不占用 runner。

在 **Settings → Actions → General** 将 fork PR 审核策略设为所有外部贡献者均需审核（`all_external_contributors`），已有贡献记录的外部账号也需要先经过 GitHub 原生审核。该审核与 `pr-ci` 环境审批分别生效。配置后回读核验：

```bash
gh api repos/icelib/repoctl/environments/pr-ci \
  --jq '{name, can_admins_bypass, protection_rules}'
gh api repos/icelib/repoctl/actions/permissions/fork-pr-contributor-approval
```

环境审批与 GitHub App 配置互相独立。PR Checks 不申请 App 令牌；GitHub App 继续用于 Release 和手动 backfill，配置见 [自动提交认证](./github-app-automation.md)。

在 **Settings → Actions → Policies** 更新现有策略 **7479**，在 `allowed_events` 中追加 `pull_request`，保留原有 `pull_request_target`、`workflow_dispatch` 和其余限制。作用路径继续仅为 `.github/workflows/pr-ci.yml`，不扩大到所有工作流，也不将该策略加入消费者模板。期望的事件规则为：

```json
{
  "type": "restrict_action_events",
  "parameters": {
    "allowed_events": ["pull_request_target", "workflow_dispatch", "pull_request"]
  }
}
```

修改前查询策略及适用的上级策略，原位更新已有策略，避免创建重复策略或丢失其他限制：

```bash
gh api -H 'X-GitHub-Api-Version: 2026-03-10' \
  'repos/icelib/repoctl/actions/policies?has_parents=true&per_page=100'
```

更新后重新查询，并通过 **Policy insights** 确认新 PR 事件没有被阻止。先完成代码验证和配置，再将工作流合入默认分支 `main`，最后用明确选定的 PR 的新事件验收；旧运行不能证明新入口已生效。参见 [默认事件策略](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target)和 [Actions 策略 API](https://docs.github.com/en/rest/actions/policies)。

## 网页与 AI 批准

在 PR 的 Checks 或 Actions 中打开对应该 PR 的 **PR Checks** 运行，点击 **Review deployments**，选择 `pr-ci`，点击 **Approve and deploy**。批准只放行所选运行。

AI 使用当前 `gh` 登录身份。先确认身份、目标 PR 和对应运行，避免批准其他 PR：

```bash
gh api user --jq .login
gh run list --repo icelib/repoctl --workflow pr-ci.yml --limit 30
gh run view <run-id> --repo icelib/repoctl
gh api repos/icelib/repoctl/actions/runs/<run-id>/pending_deployments \
  --jq '.[] | {environment: .environment.name, id: .environment.id, current_user_can_approve}'
```

仅当 `pr-ci` 的 `current_user_can_approve` 为 `true` 时提交批准。下面的命令在没有审批资格或没有待审批环境时不发送批准请求：

```bash
run_id='<run-id>'
environment_id="$(gh api "repos/icelib/repoctl/actions/runs/$run_id/pending_deployments" \
  --jq '.[] | select(.environment.name == "pr-ci" and .current_user_can_approve == true) | .environment.id')"

if [ -n "$environment_id" ]; then
  gh api --method POST "repos/icelib/repoctl/actions/runs/$run_id/pending_deployments" \
    -F "environment_ids[]=$environment_id" \
    -f state=approved \
    -f comment='Approved PR validation'
else
  echo 'No pending pr-ci deployment that this identity can approve.'
fi
```

批准后等待该运行，并检查 PR 上的原生 checks：

```bash
gh run watch <run-id> --repo icelib/repoctl --exit-status
gh pr view <pr-number> --repo icelib/repoctl --json headRefOid,baseRefName,baseRefOid,labels,statusCheckRollup,mergeStateStatus
```

AI 仅批准用户或维护者在当次任务中明确选中的 PR。禁止为“全部跑绿”批量批准无人关注的 PR，也禁止批量手动调度检查来绕过准入；这里不自动合并 PR。

合并前确认最新适用的 **PR Checks** 运行已经批准并成功，其 head、目标分支名称、base 和发布级别标签仍与当前 PR 匹配，且 **PR Validation** 属于该运行，同时满足现有审核要求。忽略普通标签导致的全跳过运行。同一 head 的发布级别标签变化也会产生新审批运行，旧绿色 checks 不能替代新运行的审批和验证。

## 重试与手动诊断

- 新提交、重新打开、转为 ready 或发布级别标签变化后，批准最新 PR 事件产生的运行。等待审批期间提交或发布级别标签变化，旧准备阶段会拒绝继续。
- 准备成功后的检查失败，可以使用 **Re-run failed jobs** 沿用已经固定的 prepare outputs；汇总仍核对当前 head/base 和发布级别标签。
- 缺少 changeset 时，执行 `pnpm change` 并推送后批准新运行。目标分支或 base 变化、合并冲突时，先同步当前目标分支并推送新提交，再用新的原生运行验证。
- 原生运行的 **Re-run all jobs** 不会读取任意最新 PR 提交来替换旧事件；事件提交和当前分支不匹配时会失败。不要通过重跑旧运行规避新提交或发布级别标签所需的审批。

手动诊断迁至独立的 `pr-ci-manual.yml`，只允许从默认分支 `main` 调度，输入 `pr_number` 并读取当前 PR 提交。它仍需一次 `pr-ci` 审批，与原生入口共用同一 PR 的取消组。从其他分支或 tag 调度的运行跳过全部 job，使用独立并发组，不取消有效检查：

```bash
gh workflow run pr-ci-manual.yml --repo icelib/repoctl --ref main -f pr_number=<pr-number>
gh run list --repo icelib/repoctl --workflow pr-ci-manual.yml --limit 30
```

手动准备与汇总代码固定于调度时默认分支的 `github.sha`，不会随默认分支后续推进而漂移。手动入口冻结并验证当前提交，使用相同的 Release Intent 先行和完整适用矩阵，写入独立的 **Manual PR Validation** 状态。它不更新普通 PR 的原生 **PR Validation** job，不能将手动成功误当作原生门禁已通过。使用同样的审批与 head/base 核验流程查看诊断结果。

手动准备失败后，**Re-run failed jobs** 会因审批所属尝试与当前重跑尝试不匹配而拒绝继续；应选择 **Re-run all jobs** 重新审批，或重新调度并批准新运行。手动准备成功后的矩阵失败仍可使用 **Re-run failed jobs**，沿用已冻结的提交。

合并后的 **Release** 沿用原有流程。Release 使用内置 `GITHUB_TOKEN` 创建或更新 PR 时，PR 事件不会启动其他工作流，因此显式调用默认分支的 `pr-ci-manual.yml`，仍等待审批；使用 App 或 PAT 时沿用正常的原生 PR 事件，避免重复启动。

## 模板边界与验收

生成项目保留自动 PR CI、自动 changeset 和发布意图检查。消费者工作流独立维护在 `packages/monorepo/assets/.github/workflows/`；本仓审批工作流和 `.github/pr-ci/` 不进入分发资产。

先运行 build、lint、typecheck、tsd、tests 和 `pnpm check:workflows`。工作流契约和回归测试覆盖审批前无 runner、完整矩阵、Release Intent 失败时不启动重型任务、head/base 或合并候选变化、标签行为、取消、全跳过运行的汇总名称隔离、准备失败的失败汇总、手动准备失败后的重试限制、矩阵失败重跑、只读权限、手动状态隔离、Release 兼容调度和消费者资产隔离。

合入默认分支后，仅用当次任务明确选定的 PR 触发新事件，记录 PR/运行 ID、测试 head/base/merge、待审批时的 runner 名称及最终结果。确认审批前没有 runner，审批后各矩阵状态直接出现在 PR 页面；普通标签不打断有效检查；发布级别标签需要重新批准；新提交、关闭和转草稿取消旧运行；失败或提交变化不能得到成功汇总。多个明确选定的 PR 可以并行验证，不批量调度无关 PR。关闭本次创建的临时验收 PR，让其任务正常取消。

参考：[环境部署保护](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[待部署环境 API](https://docs.github.com/en/rest/actions/workflow-runs#get-pending-deployments-for-a-workflow-run)、[批准待部署环境 API](https://docs.github.com/en/rest/actions/workflow-runs#review-pending-deployments-for-a-workflow-run)。
