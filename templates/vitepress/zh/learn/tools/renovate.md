# Renovate

## 1. 什么是 Renovate？

**Renovate** 是一个开源的 **依赖更新自动化工具**。
它能帮你在项目中自动检测过期的依赖，并通过 PR（Pull Request）的形式提交更新建议。

👉 简单来说：

- 你不需要手动检查 `package.json`、`requirements.txt` 等文件里的依赖是否过期。
- Renovate 会帮你自动发现并发起更新。

## 2. Renovate 有什么用？

### 🚀 核心价值

1. **自动化依赖升级**
   - 自动扫描项目依赖（支持 Node.js、Python、Java、Go、Docker 等）。
   - 自动检测新版本。
   - 自动提交 PR。

2. **降低维护成本**
   - 避免依赖长期不升级，导致一次性大版本升级困难。
   - 减少安全漏洞（及时更新安全补丁版本）。

3. **可控性强**
   - 你可以配置哪些依赖自动升级，哪些只做提醒。
   - 可以选择自动合并 **patch/minor** 版本更新，而 **major** 版本需要人工 review。

4. **支持 Monorepo**
   - 非常适合 monorepo 项目，能分别更新各个子包的依赖。

## 3. Renovate 怎么用？

### 方式一：作为 GitHub App

1. 打开 [Renovate GitHub App](https://github.com/apps/renovate) 并安装到你的仓库。
2. 它会自动在项目根目录生成一个配置文件 `renovate.json`（或 `renovate.json5`）。
3. Renovate 就会定期检查依赖，并创建 PR。

### 方式二：自托管

如果你不想用 GitHub App，可以自己部署 Renovate（适用于 GitLab、Bitbucket 等环境）。

```bash
npx renovate
```

### 配置示例

在项目根目录添加 `renovate.json`：

```json
{
  "extends": ["config:recommended", "group:allNonMajor"],
  "rangeStrategy": "bump",
  "minimumReleaseAge": "7 days",
  "internalChecksFilter": "strict",
  "automerge": true,
  "automergeType": "pr"
}
```

解释：

- 使用推荐配置，并将兼容的非 major 更新分组。
- `"rangeStrategy": "bump"` 让版本范围随升级一起更新。
- `"minimumReleaseAge": "7 days"` 要求每个新版本发布满 7 天后才进入升级候选。
- `"internalChecksFilter": "strict"` 让 `renovate/stability-days` 稳定性检查保持阻塞状态；检查通过前不会创建升级分支或 PR。
- `"automerge": true` 和 `"automergeType": "pr"` 允许通过检查的升级 PR 自动合并。

Renovate 按版本分别计时：它等待的是当前版本发布后的 7 天，而不是等待这个包连续 7 天没有新发布。安全更新也遵循相同的 7 天等待窗口，确保自动升级都经过一致的验证时间。

### 实际效果

- Renovate 会创建类似这样的 PR：
  - `chore(deps): update dependency react from 18.2.0 to 18.3.0`
  - `fix(deps): update dependency lodash from 4.17.20 to 4.17.21`

- 你可以选择直接合并，或者再测试后手动处理。

## 4. 总结

- **Renovate = 自动依赖升级管家**。
- 主要用途：**自动检测依赖更新、自动生成 PR、降低维护成本**。
- 使用方式：安装 GitHub App（最简单），或者自托管运行。
- 适用场景：
  - 需要长期维护的项目。
  - 对安全性敏感的项目（及时更新补丁）。
  - Monorepo 项目，依赖多而复杂。
