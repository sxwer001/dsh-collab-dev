# DSH 协作开发插件

[English](README.en.md) · [下载 v1.0.1](https://github.com/sxwer001/dsh-collab-dev/releases/tag/v1.0.1)

主智能体规划，子智能体并行开发，验证与独立审查通过后汇总交付。

## 安装

适用于 **DSH `0.2.0-rc.2` 和 `0.2.1-rc.5`**，需要已配置的模型，以及 Node.js 22.19+（22.x）或 24+。内置 AgentTeams 0.1.28，保留需求快照绑定和不完整计划审批保护。

桌面版从插件管理安装 `.tgz`。网页版可用：

```sh
dsh plugin --profile web add https://github.com/sxwer001/dsh-collab-dev/releases/download/v1.0.1/dsh-collab-dev-1.0.1.tgz
```

安装后按宿主提示重启。本包已内置团队组件，同一 profile 请勿重复启用独立 AgentTeams bundle。

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

v1.0.1 使用 DSH 原生子智能体与共享工作区，按任务范围协作；不提供文件系统隔离、独立 worktree 或 Codex／Claude Code 后端。Windows 保存计划时，对临时文件锁导致的 EPERM/EBUSY 原子重命名失败作有限重试，持续失败仍报错并清理未发布计划。

验证使用 Windows、Node 24 和上述两个宿主，包含脚本模型的成功/失败门禁回归。2026-11-04，1.0.1 安装包在 rc.5 上通过 `opencode-go / deepseek-v4.1-flash` 真实模型验收：8 个任务全部完成，两个 worker 开发区间重叠 82.216 秒；独立复跑 30 个测试、smoke 和额外 46 项合同检查均通过。集成门禁曾发现主智能体写错溢出测试并阻止交付；主智能体修正后由 verifier 重新验收，失败过程保留在测试记录中。正式流程共 116 次模型请求，上游连接失败由宿主重试恢复。本机 DSH 可执行文件的重启恢复及 `/collab-status`「可交付」也通过。本轮真实模型覆盖限于该模型，旧版结果保留为历史证据。

[开发与测试](DEVELOPMENT.md) · [验证记录](VERIFICATION.json) · [计划示例](examples/plan.json)

MIT · [第三方来源与许可证](THIRD_PARTY_NOTICES.md)
