# DSH 协作开发插件

[English](README.en.md) · [下载 v1.0.0](https://github.com/sxwer001/dsh-collab-dev/releases/tag/v1.0.0)

主智能体规划，子智能体并行开发，验证与独立审查通过后汇总交付。

## 安装

适用于 **DSH `0.2.0-rc.2`**，需要已配置的模型和 Node.js ≥22.19.0。

```sh
dsh plugin --profile desktop add https://github.com/sxwer001/dsh-collab-dev/releases/download/v1.0.0/dsh-collab-dev-1.0.0.tgz
```

网页版将 `desktop` 换成 `web`，安装后按宿主提示重启。本包已内置团队组件，同一 profile 请勿重复启用独立 AgentTeams bundle。

## 使用

```text
/collab-dev 为现有应用增加订单 API 和订单查询页面
```

1. 主智能体检查项目，建立共享框架、接口和完整任务计划。
2. 在团队面板审阅计划，点击 **Approve & Run**。
3. 两个 worker 并行开发，verifier 验证，reviewer 独立审查，最后集成。
4. 输入 `/collab-status` 查看进度、验证结果和交付阻塞。

计划和架构保存在 `.collab-dev/`。无效依赖、缺失验收阶段及并行写入范围冲突会被拒绝；上传不完整的计划无法批准运行。调整草稿任务数量时，请丢弃草稿并重新保存、创建计划。

## 范围

v1.0.0 使用 DSH 原生子智能体与共享工作区，按任务范围协作；不提供文件系统隔离、独立 worktree 或 Codex／Claude Code 后端。目前已验证 Windows、Node 24.15.0 和上述 DSH 版本。

[开发与测试](DEVELOPMENT.md) · [验证记录](VERIFICATION.json) · [计划示例](examples/plan.json)

MIT · [第三方来源与许可证](THIRD_PARTY_NOTICES.md)
