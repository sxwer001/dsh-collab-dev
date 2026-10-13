# DSH 协作开发插件

[English](README.en.md) · [安装包与版本说明](https://github.com/sxwer001/dsh-collab-dev/releases/tag/v0.1.1)

`dsh-collab-dev` 让主智能体先确定架构、接口与完整任务计划，再通过原生子智能体协作开发。首版以 [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) `0.1.23` 为固定依赖，复用任务调度、成员通信、质量门禁和团队界面。

这是 `0.1.1` 开发预览版，兼容目标为 **DSH `0.2.0-rc.2`**。首版使用共享工作区按范围并行；独立 worktree、Codex 和 Claude Code 后端暂未加入。安装包内置 AgentTeams 0.1.23，并包含一处需求审查快照绑定修复，见 THIRD_PARTY_NOTICES.md。

## 安装

下载 [dsh-collab-dev-0.1.1.tgz](https://github.com/sxwer001/dsh-collab-dev/releases/download/v0.1.1/dsh-collab-dev-0.1.1.tgz)，在 DSH 插件管理界面添加该文件，或使用对应版本 CLI：

```powershell
dsh plugin --profile desktop add https://github.com/sxwer001/dsh-collab-dev/releases/download/v0.1.1/dsh-collab-dev-0.1.1.tgz
```

网页版把 `desktop` 换成 `web`，自定义 profile 则使用对应名称。按宿主提示重启并刷新界面。发布包自带可执行 ESM 和已修复的固定版本 AgentTeams，无需安装时编译或执行构建脚本；宿主依赖解析仍可能访问 npm。仅验证 DSH `0.2.0-rc.2`，其他版本请先在独立 profile 验证。

从源码构建时先运行 `npm install --ignore-scripts`，再运行 `npm pack`。打包前自动应用本文所述的需求快照修复并执行语法与单元检查；请安装生成的 `.tgz`，不要用未打包的 GitHub 源码替代发布包。

本包已挂载 AgentTeams 并提供 `collab-dev` 配置，**同一 profile 不要另行启用 AgentTeams 的独立 bundle**，否则会重复插入 `agent-teams` 行。已有独立安装时先停用其 bundle，再启用本包；停用不会删除团队状态。插件不自行编辑用户 profile 或升级宿主。

## 使用

在聊天中输入：

```text
/collab-dev 为现有应用增加订单 API 和订单查询页面，保留现有接口兼容性。
```

也可以直接要求主智能体“用 collab-dev 协作开发完成这个目标”。DSH 需预先配置可用模型；成员默认继承主智能体的模型路由。

1. 主智能体检查项目、现有改动与真实验证命令，确定架构、公共接口和框架合同。
2. `collab_dev_plan` 校验并保存完整计划，拒绝循环依赖、缺少验收阶段、不完整审查和并行写入范围重叠。
3. `collab_dev_start` 转换为真实 AgentTeams 质量任务，将本地任务引用映射为宿主任务 ID；整个团队保持待批准状态。
4. 在原生团队界面查看计划，点击 **Approve & Run**。规划期不调用成员模型，批准后由原有调度器执行就绪任务。
5. `worker-a` 和 `worker-b` 编码，`verifier` 执行验证，`reviewer` 独立审查；最终集成依赖每项实现的审查结果。
6. 主智能体通过 `agent_teams_status` 和团队面板汇总。验证失败不会解锁下游；有界修复、复审、停止和恢复沿用上游机制。

计划文件位于 `.collab-dev/<会话键>/<计划编号>/`：

| 文件 | 内容 |
| --- | --- |
| `PLAN.md` | 目标、约束、责任人、依赖和验收 |
| `ARCHITECTURE.md` | 主智能体确定的模块、接口与框架合同 |
| `plan.json` | 可校验的完整任务计划 |

每次保存生成新目录，保留旧计划。其他会话和子成员不能通过本插件启动该计划。团队状态仍由 AgentTeams 保存在 `.agent-teams/`，没有第二套调度或任务状态机。

格式见 [examples/plan.json](examples/plan.json)。示例里的 `npm run ...` 必须换成项目中真实存在、预检过的命令。`dependencies` 和 `reviewedTaskId` 使用本地 ID，启动工具负责映射。

## 范围与限制

公共类型、依赖、lockfile 和共享入口交给串行任务。并行实现必须声明互不重叠的 `inScope`；路径用工作区相对 POSIX 格式，首版不接受 glob、绝对路径和受保护目录。共享目录的串行实现须直接声明前一实现为依赖，以满足当前 AgentTeams 的范围校验。

成员不能调用本包的计划、启动工具，也不能继续委派。范围校验与质量门禁是交付审计，**不是完整文件系统隔离**；保留 shell 能力的角色不属于硬只读沙箱。不要直接编辑 `.agent-teams` 状态，也不要绕过当前 `attempt_id`。

启动失败时，已创建的部分团队仍为待批准状态。检查或丢弃该草稿后重试；计划文件保留。同一主会话恢复复用 AgentTeams 原生能力，本次真实验收覆盖了冷恢复、保留已完成任务和轮换未完成尝试的执行编号。跨宿主迁移尚未验证；插件不自动清理用户改动或发布。

## 验证

```powershell
npm run check
npm test
npm run test:runtime
```

已验证 Windows、Node `24.15.0`、DSH `0.2.0-rc.2`、npm 发布的 AgentTeams `0.1.23`：

- 5 组计划、依赖、审查、路径和存储检查。
- 真实 DSH CLI、Loader、工具执行管线和原生成员的成功及失败场景。
- 两个 worker 实际执行时间重叠；成功任务完成验证、独立审查和最终集成。
- 真实命令失败后下游集成保持待执行；规划期间成员未启动。
- 原生命令入口与状态工具可用，成员不可见本包的计划和启动工具。
- 宿主客户端模块注册表发现上游团队 UI；未做浏览器像素验收。

门禁回归以脚本模型检查成功和真实命令失败后的阻断。另已通过桌面 profile 的真实 `opencode-go/deepseek-v4.1-flash` 验收：主智能体建共享框架并规划 8 个任务，两个原生 worker 开发定价/运费模块，独立验证、审查后集成并生成 TEST_SUMMARY.md。26 个交付测试及 46 条额外接口检查通过，编码任务的执行窗口重叠 69.419 秒。沿用当前 `max` 推理设置；这是功能样本，不是提速基准或任意项目成功率证明。

真实模型验收需主动执行 `node scripts/live-check.mjs`。脚本沿用本机桌面 profile 的 OpenCode Go 配置，只在自有工作区运行，通过原生凭据服务认证，不复制凭据值。续测用 `node scripts/live-check.mjs resume <原测试目录>`。测试控制器超时不等于业务测试失败，应检查记录后恢复原团队。

开发依赖可通过 `scripts/prepare-runtime.mjs <已验证宿主 node_modules> <AgentTeams 0.1.23 解包目录>` 准备；默认路径适用于本工作区。所有测试数据在项目的 `.test-runtime/` 与 `.scratch/`，不修改原宿主、用户配置或凭据。精简结果见 `VERIFICATION.json`。

## 来源与许可证

MIT，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。这是独立社区扩展，没有 DeepSeek 或原作者背书。开发采用用户指定的 Ponytail full，只增加必要的计划校验和接入代码。
