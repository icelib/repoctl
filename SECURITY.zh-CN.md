# 安全策略

[English](SECURITY.md) | 简体中文

## 支持版本

安全修复面向 `repoctl` 最新稳定主版本及与其固定版本发布的 core 包。报告可能已经修复的问题前，请先升级到最新版本。

## 报告漏洞

不要为疑似漏洞创建公开 issue。请使用 `sonofmagic/repoctl` 的 GitHub 私密漏洞报告：

https://github.com/icelib/repoctl/security/advisories/new

报告应包含受影响版本、运行环境、影响、复现步骤和可用的缓解建议。维护者会在合理时间内确认完整报告，并与报告者协调验证、修复和披露。

## 范围

repoctl 命令执行、生成工作流安全、发布凭据、依赖处理、路径穿越和不安全模板解包相关问题均在范围内。第三方工具的问题也应在适当时向其上游报告。
