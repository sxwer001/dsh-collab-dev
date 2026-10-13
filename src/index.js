import { randomUUID } from 'node:crypto';
import path from 'node:path';
import runtimePackage from '@deepseek-ai/dsh-tools/package.json' with { type: 'json' };
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm';
import { savePlan, loadPlan, taskArguments, requireMainSession, MEMBERS } from './plan.js';
import { summarizeStatus, renderStatus } from './status.js';

export const name = 'collab-dev';
export const inject = ['tools', 'systemPrompt'];
const text = { type: 'string', required: true };
const list = { type: 'array', items: { type: 'string' } };
const jsonOutput = { type: 'object', additionalProperties: true };

const PROTOCOL = `Collaborative development with the collab-dev profile:
Use only when the user requests collaborative development or invokes /collab-dev.
The main agent owns the goal, architecture, public interfaces and smallest complete plan.
Inspect the actual repository, instructions, current changes and available validation commands first.
Use collab_dev_plan to persist goal, constraints, architecture and the complete quality DAG.
Use requirements -> implementation -> verification -> independent review -> integration.
The profile contains worker-a, worker-b, verifier and reviewer. Different independent modules may run in parallel.
Set kind and assignee explicitly. Give each implementation inScope and real verify commands.
Common interfaces, global configuration and lockfiles must be handled serially; do not let parallel tasks own overlapping paths.
When two implementation scopes overlap, the later task must directly depend on the earlier implementation, even if another dependency already connects them.
After saving a valid plan, collab_dev_start creates the complete STAGED team. Show the plan and yield for the native Approve & Run action.
Do not approve in the same planning turn. After approval, the upstream scheduler starts ready members automatically.
Use collab_dev_status after reports or user requests to summarize native progress and verification/integration results; use the native team panel to inspect, stop or resume.
Do not claim completion from a closing message or idle state. Require actual checks, independent review and final integration.
Reuse the current team and its attempt_id; never duplicate the scheduler or directly edit .agent-teams files.
Member tool policies deny collab_dev_plan, collab_dev_start and collab_dev_status. This version uses a shared workspace and completion audits, not a filesystem sandbox.
Do not commit, push, publish or deploy unless that action was authorized by the user.`;

async function invokeTool(ctx, exec, name, args) {
  exec.signal.throwIfAborted();
  const callId = ToolCallId(`collab-${randomUUID()}`);
  const result = await ctx.tools.execute({ name, arguments: args, agent: exec.agent, signal: exec.signal,
    callId, rootCallId: exec.rootCallId ?? callId, parent: exec.token });
  if (result.isError) throw new Error(`${name}: ${result.error?.message ?? '执行失败'}`);
  return result.value;
}

export function apply(ctx) {
  if (runtimePackage.version !== '0.2.0-rc.2') throw new Error('dsh-collab-dev 仅验证了 DSH 0.2.0-rc.2，请使用对应宿主版本。');
  const starting = new Set();
  ctx.systemPrompt.section({ name: 'collab-dev:workflow', order: 118, interpolate: false,
    text: context => context.agent?.session.header.parentSession ? '' : PROTOCOL });
  ctx.tools.register(defineTool({
    name: 'collab_dev_plan', description: 'Save a validated collaborative development plan and architecture before starting any members. Main-session only.',
    parameters: {
      goal: text, architecture: { ...text, description: 'Modules, interfaces, shared skeleton and design decisions settled by the main agent.' },
      constraints: list,
      tasks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        id: { ...text, description: 'Local ID: 1-32 lowercase letters, digits or hyphens; start with a letter. Example: verify-api. Underscores are invalid.' }, subject: text, objective: text,
        kind: { ...text, enum: ['requirements', 'implementation', 'verification', 'review', 'integration'] },
        assignee: { ...text, enum: MEMBERS }, dependencies: list, acceptance: { ...list, required: true },
        inScope: { ...list, description: 'Exact workspace-relative POSIX file or directory paths; no globs. Parallel implementations must not overlap.' },
        verify: list, reviewedTaskId: { type: 'string', description: 'Local ID of the implementation being reviewed, from this same plan.' },
      } } },
    },
    output: { schema: jsonOutput, render: (_args, value) => [{ type: 'text', text: `开发计划已保存：${value.directory}\n计划编号：${value.plan_id}；${value.task_count} 个任务。调用 collab_dev_start 创建可查看的团队计划。` }] },
    execute(args, exec) { exec.signal.throwIfAborted(); return savePlan(exec.agent, args); },
  }));

  ctx.tools.register(defineTool({
    name: 'collab_dev_start', description: 'Create the complete staged AgentTeams quality DAG from a saved plan. Starts no model members until the user approves in the native panel. Main-session only.',
    parameters: { plan_id: text },
    output: { schema: jsonOutput, render: (_args, value) => [{ type: 'text', text: `团队 ${value.team_id} 的完整计划已准备好，共 ${value.task_count} 项。请在原生团队界面查看并批准运行。计划文件：${value.directory}` }] },
    async execute(args, exec) {
      if (starting.has(exec.agent?.id)) throw new Error('本会话正在创建团队，请勿重复启动。');
      const { plan, directory } = await loadPlan(exec.agent, args.plan_id);
      if (starting.has(exec.agent.id)) throw new Error('本会话正在创建团队，请勿重复启动。');
      starting.add(exec.agent.id);
      let team;
      try {
        const invoke = (name, args) => invokeTool(ctx, exec, name, args);
        team = await invoke('agent_teams_create', { name: 'collab-' + args.plan_id, profile: 'collab-dev',
          approval: 'required', description: `协作计划：${plan.tasks.length} 项任务\n${plan.goal}\n\n架构合同和计划：${directory}\n\n${plan.architecture}` });
        const ids = Object.create(null);
        for (const task of plan.tasks) {
          const input = taskArguments(task, ids);
          if (task.kind === 'requirements') {
            const snapshot = `.collab-dev/${path.basename(path.dirname(directory))}/${args.plan_id}`;
            input.inScope = [...new Set([...input.inScope, `${snapshot}/ARCHITECTURE.md`, `${snapshot}/plan.json`])];
          }
          const created = await invoke('agent_teams_create_task', input);
          ids[task.id] = created.task_id;
        }
        return { team_id: team.team_id, directory, task_count: plan.tasks.length, task_ids: ids, phase: 'staged' };
      } catch (error) {
        // A partial team stays staged, so failure cannot silently launch code writers.
        throw new Error(`${error.message}${team ? `；团队 ${team.team_id} 仍为待批准状态，请检查或丢弃未完成计划。` : ''}`);
      } finally { starting.delete(exec.agent.id); }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'collab_dev_status', description: 'Summarize native team progress, verification/integration task results and delivery blockers. Main-session only. Native status may wake already approved work; it never approves a staged plan or resumes a halted team.',
    parameters: {},
    output: { schema: jsonOutput, render: (_args, value) => [{ type: 'text', text: renderStatus(value) }] },
    async execute(_args, exec) {
      requireMainSession(exec.agent);
      return summarizeStatus(await invokeTool(ctx, exec, 'agent_teams_status', {}));
    },
  }));

  ctx.inject(['commands'], commandCtx => {
    commandCtx.commands.register({ name: 'collab-dev', description: '主智能体制定架构与计划，再协作开发', input: { hint: '<开发目标>' },
      handler(invocation) {
        requireMainSession(invocation.agent);
        invocation.signal.throwIfAborted();
        const goal = invocation.rawInput.trim();
        if (!goal || goal.length > 4000) return { kind: 'error', text: '用法：/collab-dev <开发目标，最多 4000 字符>' };
        invocation.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text',
          text: `请使用 collab-dev 协作开发完成以下目标。先检查项目并制定架构和完整任务计划，用 collab_dev_plan 保存，再用 collab_dev_start 创建团队草稿供我查看。\n\n目标：${goal}` }] }));
        return { kind: 'success', text: '主智能体将先制定架构与协作计划。' };
      },
    });
    commandCtx.commands.register({ name: 'collab-status', description: '查看协作进度、验证结果和交付阻塞',
      async handler(invocation) {
        if (invocation.rawInput.trim()) return { kind: 'error', text: '用法：/collab-status' };
        requireMainSession(invocation.agent);
        const summary = await invokeTool(ctx, invocation, 'collab_dev_status', {});
        return { kind: 'success', text: renderStatus(summary) };
      },
    });
  });
}
