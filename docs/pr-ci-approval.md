# PR 检查审批

本源码仓库的 PR 创建、更新、重新打开、转为 ready 或标签变化，只会创建等待 `pr-ci` 环境审批的 **PR Checks** 运行。批准前不启动 runner，也不生成 changeset、构建或测试。草稿 PR 跳过审批任务，转为 ready 后才产生可批准的运行。

每次运行只需批准一次。不同 PR 可以同时批准和验证；同一 PR 的新运行会取消旧运行。合并及合并后的 **Release** 继续使用原有流程，Release PR 的验证也要审批。Release 使用内置令牌创建 PR 时，会显式启动一条待审批的 PR Checks，避免令牌的事件抑制导致没有审批入口。

## 环境配置

在 **Settings → Environments** 创建 `pr-ci`，打开 **Required reviewers**，添加 `sonofmagic`，关闭 **Prevent self-review**，允许使用同一身份创建 PR 和批准检查。关闭 **Allow administrators to bypass configured protection rules**。审批任务在 GitHub 确认批准之前等待，不占用 runner。

环境审批与 GitHub App 配置互相独立。本仓 PR 准备阶段使用内置 `GITHUB_TOKEN`；GitHub App 继续用于 Release 和手动 backfill，配置见 [自动提交认证](./github-app-automation.md)。

Release 使用内置 `GITHUB_TOKEN` 创建或更新 PR 时，其事件不会触发 `pull_request_target`。源码仓库的 Release 会显式从默认分支启动 PR Checks，仍需环境审批；使用 App 或 PAT 时沿用正常 PR 事件，避免重复启动。

先完成代码验证并配置环境，再将工作流合入默认分支 `main`，最后用新 PR 或新提交验收。`pull_request_target` 使用基础分支上的工作流，旧运行不能证明新配置已生效。

## 网页批准

在 PR 的 Checks 或 Actions 中打开名称对应该 PR 的 **PR Checks** 运行，点击 **Review deployments**，选择 `pr-ci`，点击 **Approve and deploy**。批准只放行所选运行。

批准后，受信任的准备脚本先补充自动 changeset，再固定最终 head、最新目标分支 base 和两者组成的测试 merge SHA。CI、Dev Container 和发布意图检查验证这些固定提交，最后将 **PR Validation** 状态写到最终 PR head 上。CI 和 Dev Container 保留原有路径筛选；不适用的检查可以跳过。

人工 changeset 保留。fork PR 若改动可发布包，需要作者自行补 changeset；审批后若发现缺失，会提示作者并停止验证。执行 PR 代码的检查只有读取权限，写入 changeset 和结果的任务只执行受信任脚本。

## AI 通过 API 批准

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

批准后可以等待该运行，并检查最终 PR 提交上的汇总状态：

```bash
gh run watch <run-id> --repo icelib/repoctl --exit-status
gh pr view <pr-number> --repo icelib/repoctl --json headRefOid,statusCheckRollup,mergeStateStatus
```

AI 按当次任务选择批准哪些 PR。这里没有全仓串行锁，也不自动合并 PR。合并前确认该 PR 的最新 **PR Checks** 运行已经批准并成功，且最新 head 上 **PR Validation** 链接指向该运行，同时满足现有审核要求。同一 head 的标签变化或手动启动也可能产生新运行；等待审批时旧成功状态仍可能显示在 head 上，不能据此合并。若 head 或目标分支变化，旧验证结果不能作为最新基线的验证依据。

## 重试与提交变化

- 提交更新后，批准最新 PR 事件产生的运行。等待审批期间 head 变化，旧运行的准备阶段会拒绝继续。
- 准备成功之后的检查失败，**Re-run failed jobs** 可以沿用已经固定的 prepare outputs。最终汇总仍会核对当前 head 和 base。
- 自动 changeset 会改变 head，但内置 `GITHUB_TOKEN` 的提交不触发新的 PR 工作流。此时 **Re-run all jobs** 会重读旧事件中的 head，准备阶段会拒绝；需要从默认分支手动创建新运行，再批准。
- base 变化、合并冲突或准备失败，也应在解决问题后创建并批准新的运行。

手动启动的 PR Checks 只允许默认分支 `main`，并读取当前 PR 的最新 head：

```bash
gh workflow run pr-ci.yml --repo icelib/repoctl --ref main -f pr_number=<pr-number>
```

随后通过 `gh run list` 找到新运行并执行相同审批流程。手动启动不绕过 `pr-ci` 环境审批。

## 模板边界与验收

生成项目保留自动 PR CI、自动 changeset 和发布意图检查。消费者工作流独立维护在 `packages/monorepo/assets/.github/workflows/`；本仓审批工作流和 `.github/pr-ci/` 不进入分发资产。

验收时确认：新建、push、reopen、ready 和标签变化都先等待审批；网页和 API 批准后完整执行适用检查；最终状态对应 changeset 后的 head；两条已批准 PR 可以并行；失败或提交变化不能得到成功汇总。合并后的 Release 应照常运行。

参考：[环境部署保护](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[待部署环境 API](https://docs.github.com/en/rest/actions/workflow-runs#get-pending-deployments-for-a-workflow-run)、[批准待部署环境 API](https://docs.github.com/en/rest/actions/workflow-runs#review-pending-deployments-for-a-workflow-run)。
