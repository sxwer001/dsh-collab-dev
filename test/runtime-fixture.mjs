// Deterministic model; real Harness, tools, members, scheduler, files and checks.
import assert from 'node:assert/strict';
import { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const name = 'collab-runtime-fixture';
export const inject = ['llm', 'agents', 'tools', 'sessions', 'commands', 'clientModules'];
const model = { provider: 'collab-fixture', id: 'fixture', name: 'Offline fixture', context: { contextWindow: 262144 }, defaultMaxTokens: 8192 };
const steps = new Map(), measurements = new Map();
let rootId, phase = 'plan', rootStep = 0, planId, callSeq = 0;
const log = data => appendFileSync(process.env.COLLAB_TRACE, JSON.stringify({ ...data, time: Date.now() }) + '\n');
const statePath = () => join(process.cwd(), '.agent-teams', readdirSync(join(process.cwd(), '.agent-teams')).find(name => name.startsWith('collab-')), 'team.json');
const state = () => JSON.parse(readFileSync(statePath(), 'utf8'));
const chunks = value => [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: value }, { type: 'block-end', index: 0, block: { type: 'text', text: value } }, { type: 'finish', reason: { kind: 'stop' } }];
const call = (name, args) => {
  const id = ToolCallId('fixture-' + (++callSeq)), arguments_ = JSON.stringify(args);
  return [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: arguments_ },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: arguments_ } }, { type: 'finish', reason: { kind: 'tool-calls' } }];
};
function fixturePlan() {
  const value = JSON.parse(readFileSync(process.env.COLLAB_PLAN, 'utf8'));
  value.goal = 'Build two independent fixture modules and verify the whole delivery.';
  value.architecture = 'Main agent framework: modules/a.txt and modules/b.txt are independent. Both must contain their module name. node check.mjs validates real file contents. No other files are modified.';
  value.tasks[1].inScope = ['modules/a.txt']; value.tasks[2].inScope = ['modules/b.txt'];
  for (const task of value.tasks) {
    if (['api', 'verify-api'].includes(task.id)) task.verify = ['node check.mjs a'];
    if (['ui', 'verify-ui'].includes(task.id)) task.verify = ['node check.mjs b' + (task.id === 'verify-ui' && process.env.COLLAB_SCENARIO === 'failure' ? ' --fail' : '')];
    if (task.id === 'integration') task.verify = ['node check.mjs all'];
  }
  return value;
}
class FixtureAdapter extends LlmAdapter {
  async listModels() { return [model]; }
  async resolveModel(provider, id) { return { ...model, provider, id }; }
  async *stream(options) {
    if (options.purpose) { yield* chunks('Fixture'); return; }
    const messages = options.messages.flatMap(message => message.role === 'tool' ? [{ type: 'tool-result', content: message.content, isError: message.isError }] : message.content ?? []);
    const failed = messages.filter(block => block.type === 'tool-result' && block.isError).at(-1);
    if (failed) throw new Error('Fixture tool failed: ' + JSON.stringify(failed));
    const isRoot = options.sessionId === rootId;
    const system = options.system ?? options.messages.filter(message => message.role === 'system').flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text)).join('\n');
    log({ event: 'request', session: options.sessionId, root: isRoot, tools: options.tools.map(tool => tool.name) });
    if (isRoot) {
      if (phase === 'plan') {
        assert.match(system, /collab_dev_plan|Collaborative development/);
        if (rootStep++ === 0) { yield* call('collab_dev_plan', fixturePlan()); return; }
        if (rootStep === 2) {
          const text = messages.filter(block => block.type === 'tool-result').flatMap(block => block.content?.map(part => part.text ?? '') ?? []).join('\n');
          planId = text.match(/计划编号：([a-f0-9-]{36})/)?.[1];
          assert.ok(planId, text);
          yield* call('collab_dev_start', { plan_id: planId }); return;
        }
        yield* chunks('STAGED_PLAN_OK'); return;
      }
      if (phase === 'approve' && rootStep++ === 0) {
        yield* call('agent_teams_approve', { confirmation: 'The user explicitly approves this fixture plan now.' }); return;
      }
      if (phase === 'status' && rootStep++ === 0) { yield* call('collab_dev_status', {}); return; }
      yield* chunks('CAPTAIN_YIELDED'); return;
    }
    assert.ok(!options.tools.some(tool => ['collab_dev_plan', 'collab_dev_start', 'collab_dev_status'].includes(tool.name)), 'Member must not use captain collaboration tools');
    const snapshot = state();
    const member = snapshot.members.find(item => item.id === options.sessionId);
    assert.ok(member, options.sessionId);
    const task = snapshot.tasks.find(item => item.assignee === member.name && ['claimed', 'in_progress'].includes(item.status));
    if (!task) { yield* chunks('MEMBER_IDLE'); return; }
    const key = task.id + ':' + task.attemptId, step = steps.get(key) ?? 0;
    steps.set(key, step + 1);
    if (step === 0) { yield* call('agent_teams_claim_task', { task_id: task.id }); return; }
    if (step === 1) { yield* call('agent_teams_update_task', { task_id: task.id, attempt_id: task.attemptId, status: 'in_progress' }); return; }
    if (step === 2) { yield* call('fixture_check', { task_id: task.id }); return; }
    if (step === 3) {
      const result = measurements.get(key); assert.ok(result);
      const passed = result.exitCode === 0;
      yield* call('agent_teams_update_task', {
        task_id: task.id, attempt_id: task.attemptId, status: passed ? 'completed' : 'failed', output: passed ? 'Actual validation passed.' : 'Actual validation failed.',
        ...['requirements', 'review'].includes(task.kind) ? { verdict: passed ? 'pass' : 'reject' } : {},
        ...['implementation', 'repair'].includes(task.kind) ? { changedPaths: task.inScope } : {},
        acceptanceResults: task.acceptance.map(criterion => ({ criterion, status: passed ? 'passed' : 'failed', evidence: result.output })),
        commandsRun: (task.verify ?? []).map(command => ({ command, status: passed ? 'passed' : 'failed', exitCode: result.exitCode, evidence: result.output })),
      }); return;
    }
    yield* chunks('MEMBER_DONE');
  }
}

export function apply(ctx) {
    const errors = [];
    ctx.on('agent/turn-error', ({ error }) => { errors.push(error); console.error('Fixture turn error:', error?.stack ?? error); });
  ctx.llm.registerAdapter(['collab-fixture'], new FixtureAdapter());
  ctx.tools.register(defineTool({ name: 'fixture_check', description: 'Execute the fixture task on real files.',
    parameters: { task_id: { type: 'string', required: true } }, output: { schema: { type: 'object', additionalProperties: true }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    async execute(args, exec) {
      const snapshot = state(), task = snapshot.tasks.find(item => item.id === args.task_id);
      const member = snapshot.members.find(item => item.id === exec.agent.id);
      assert.equal(task.assignee, member.name);
      const key = task.id + ':' + task.attemptId;
      log({ event: 'check-start', task: task.id, kind: task.kind });
      if (task.kind === 'implementation') {
        await new Promise(resolve => setTimeout(resolve, 400));
        exec.signal.throwIfAborted();
        mkdirSync(join(process.cwd(), 'modules'), { recursive: true });
        const file = task.inScope[0]; assert.ok(['modules/a.txt', 'modules/b.txt'].includes(file));
        writeFileSync(join(process.cwd(), file), file.includes('a.txt') ? 'a' : 'b');
      }
      let output = 'Architecture contract checked.', exitCode = 0;
      try {
        const command = task.verify?.[0];
        if (command) {
          const args = command.split(' ').slice(1); assert.equal(args[0], 'check.mjs');
          output = execFileSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } else if (task.kind === 'review') {
          const target = snapshot.tasks.find(item => item.id === task.reviewedTaskId);
          const file = target.inScope[0]; assert.ok(['modules/a.txt', 'modules/b.txt'].includes(file));
          assert.equal(readFileSync(join(process.cwd(), file), 'utf8'), file.includes('a.txt') ? 'a' : 'b');
          output = 'Independent file review passed.';
        }
      } catch (error) { exitCode = error.status ?? 1; output = String(error.stderr ?? error.message); }
      const result = { exitCode, output }; measurements.set(key, result);
      log({ event: 'check-end', task: task.id, kind: task.kind, exitCode });
      return result;
    },
  }));
  void (async () => {
    await ctx.get('loader').await();
    assert.ok(ctx.clientModules.clientPath('@nanmicoder/dsh-agent-teams'), 'Upstream team UI must be discovered from the contributed host row');
    log({ event: 'client-module-registered', module: '@nanmicoder/dsh-agent-teams' });
    const handle = await ctx.agents.create({ sessionId: 'collab-test-' + randomUUID(), meta: { cwd: process.cwd() }, agentOptions: { provider: model.provider, model: model.id } });
    rootId = handle.agent.id;
    ctx.effect(() => () => handle.dispose());
    await handle.agent.whenIdle();
    const send = async text => { handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })); await handle.agent.whenIdle(); };
    const invoke = (name, args) => ctx.tools.execute({ name, arguments: args, agent: handle.agent,
      signal: new AbortController().signal, callId: ToolCallId('regression-' + randomUUID()) });
    const partial = await invoke('agent_teams_create', { name: 'incomplete-' + randomUUID(), profile: 'collab-dev',
      approval: 'required', description: '协作计划：8 项任务\nIncomplete-plan regression' });
    assert.equal(partial.isError, false);
    const requirement = fixturePlan().tasks[0];
    const task = await invoke('agent_teams_create_task', { subject: requirement.subject, kind: requirement.kind,
      assignee: requirement.assignee, objective: requirement.objective, acceptance: requirement.acceptance });
    assert.equal(task.isError, false);
    const premature = await invoke('agent_teams_approve', { confirmation: 'Test user intentionally attempts to approve an incomplete plan.' });
    assert.equal(premature.isError, true);
    assert.match(premature.error.message, /尚未完整创建/);
    const partialState = JSON.parse(readFileSync(join(partial.value.state_dir, 'team.json'), 'utf8'));
    assert.equal(partialState.phase, 'staged'); assert.ok(partialState.members.every(member => !member.id));
    assert.equal((await invoke('agent_teams_delete', {})).isError, false);
    log({ event: 'partial-approval-blocked' });
    const activated = await ctx.commands.execute(handle.agent, '/collab-dev Build two independent modules', [], new AbortController().signal);
    assert.equal(activated?.result.kind, 'success');
    await handle.agent.whenIdle();
    const staged = state();
    assert.equal(staged.phase, 'staged'); assert.equal(staged.tasks.length, 8); assert.equal(staged.members.length, 4);
    assert.ok(staged.members.every(member => !member.id), 'No child may spawn during planning');
    log({ event: 'staged', tasks: staged.tasks.length, noMembersStarted: true });
    const stagedStatus = await ctx.commands.execute(handle.agent, '/collab-status', [], new AbortController().signal);
    assert.equal(stagedStatus.result.kind, 'success', stagedStatus.result.text);
    assert.match(stagedStatus.result.text, /等待批准/);
    assert.ok(state().members.every(member => !member.id));
    const duplicate = await invoke('collab_dev_start', { plan_id: planId });
    assert.equal(duplicate.isError, true); assert.equal(state().tasks.length, 8);
    phase = 'approve'; rootStep = 0;
    await send('I explicitly approve the completed fixture plan. Run it now.');
    const deadline = Date.now() + 45_000;
    let snapshot;
    do {
      snapshot = state();
      if (snapshot.tasks.every(task => task.status === 'completed') || snapshot.tasks.some(task => task.kind === 'verification' && task.status === 'failed')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    if (process.env.COLLAB_SCENARIO === 'failure') {
      assert.ok(snapshot.tasks.some(task => task.kind === 'verification' && task.status === 'failed'));
      assert.equal(snapshot.tasks.find(task => task.kind === 'integration').status, 'pending');
      log({ event: 'failure-blocked', taskStates: snapshot.tasks.map(task => ({ id: task.id, status: task.status })) });
    } else {
      assert.ok(snapshot.tasks.every(task => task.status === 'completed'), JSON.stringify(snapshot.tasks.map(task => ({ id: task.id, status: task.status, output: task.output }))));
      assert.ok(snapshot.tasks.find(task => task.kind === 'requirements').reviewedArtifacts?.length >= 2, 'Requirements verdict must bind the saved architecture and plan bytes');
      log({ event: 'delivery-complete', tasks: snapshot.tasks.length });
    }
    phase = 'status'; rootStep = 0;
    await send('Please inspect the current team and summarize the verified outcome.');
    const result = await invoke('collab_dev_status', {});
    assert.equal(result.isError, false);
    assert.equal(result.value.deliverable, process.env.COLLAB_SCENARIO === 'success');
    assert.ok(result.value.tests.some(task => task.kind === 'integration'));
    const humanStatus = await ctx.commands.execute(handle.agent, '/collab-status', [], new AbortController().signal);
    assert.equal(humanStatus.result.kind, 'success', humanStatus.result.text);
    assert.match(humanStatus.result.text, /验证与集成任务/);
    log({ event: 'status-summary', deliverable: result.value.deliverable, tests: result.value.tests.length });
    assert.equal(errors.length, 0, 'No model turn may fail silently');
    await handle.agent.whenIdle();
    await ctx.sessions.flush(handle.agent.session);
    console.log('COLLAB_RUNTIME_OK');
    ctx.get('appExit')(0);
  })().catch(error => { console.error(error.stack ?? error); ctx.get('appExit')(1); });
}
