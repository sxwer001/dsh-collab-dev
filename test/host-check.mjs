// Real host registries/executor; no provider requests or user sessions.
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { CommandRuntime } from '@deepseek-ai/dsh-commands';
import { ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import * as plugin from '../src/index.js';

const ctx = new Context();
new SystemPrompt(ctx, { includeHarnessIdentity: false, includeRuntimeContext: false });
new ToolRuntime(ctx);
new CommandRuntime(ctx);
const modern = typeof ctx.tools.executable === 'function';
let releaseExecutor;
if (modern) {
  const { NativeToolExecutor } = await import('@deepseek-ai/dsh-tool-executor-native');
  releaseExecutor = ctx.tools.setExecutor(new NativeToolExecutor(ctx));
}
let enabled = true, calls = 0, terminal = false, delayed = false, drained = false;
ctx.tools.register({ name: 'agent_teams_status', description: 'Owned test status source',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
  async execute(_args, exec) {
    calls++;
    if (delayed) { await new Promise(resolve => setTimeout(resolve, 40)); drained = true; }
    if (terminal) {
      exec.deferContext(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'test deferred context' }] }));
      exec.concludeTurn();
    }
    return { team_id: 'test-team', profile: { name: 'collab-dev' }, phase: 'staged',
      halted: false, escalated: false, deliverable: false, delivery: { ok: false, blockers: ['Approval required'], warnings: [] }, tasks: [], members: [] };
  },
}, { when: () => enabled });
const agent = { id: 'host-contract-fixture', ctx, session: { header: {} } };
let sequence = 0;
async function invoke(signal = new AbortController().signal) {
  const callId = ToolCallId(`host-check-${++sequence}`);
  if (!modern) return ctx.tools.execute({ name: 'collab_dev_status', arguments: {}, agent, signal, callId });
  const toolSet = await ctx.tools.resolve({ agent, signal, modelSelection: { provider: 'fixture', model: 'fixture' } });
  try {
    const result = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: callId, name: 'collab_dev_status', arguments: '{}' }], agent, signal, toolSet });
    return result.results[0].result;
  } finally { toolSet.dispose(); }
}
try {
  for (let reload = 0; reload < 2; reload++) {
    const fiber = ctx.plugin(plugin);
    await fiber.await();
    for (const name of ['collab_dev_plan', 'collab_dev_start', 'collab_dev_status']) assert.ok(ctx.tools.get(name));
    const assembly = await ctx.systemPrompt.assemble({ agent });
    assert.equal(assembly.sections.filter(section => section.name === 'collab-dev:workflow').length, 1);
    const result = await invoke();
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(result.value.team_id, 'test-team');
    const childResult = await ctx.tools.get('collab_dev_status').execute({}, { agent: { ...agent, session: { header: { parentSession: agent.id } } }, signal: new AbortController().signal }).then(() => null, error => error);
    assert.match(childResult.message, /仅限主会话/);
    if (modern) {
      const before = calls;
      enabled = false;
      const denied = await invoke();
      assert.equal(denied.isError, true);
      assert.equal(calls, before, 'Nested dispatch must preserve the step toolSet');
      enabled = true;
      const stopGuard = ctx.tools.guard(exec => exec.name === 'agent_teams_status' ? 'test guard denial' : undefined);
      assert.equal((await invoke()).isError, true);
      assert.equal(calls, before);
      stopGuard();
      const stopAsk = ctx.on('tools/pre-execute', (exec, next) => exec.name === 'agent_teams_status' ? { kind: 'ask', reason: 'test unavailable approval' } : next());
      assert.equal((await invoke()).isError, true);
      assert.equal(calls, before);
      stopAsk();
      terminal = true;
      const completed = await invoke();
      assert.equal(completed.concludesTurn, true);
      assert.equal(completed.additionalContexts[0].content[0].text, 'test deferred context');
      terminal = false;
      delayed = true; drained = false;
      const abort = new AbortController();
      const cancelled = invoke(abort.signal);
      setTimeout(() => abort.abort(), 10);
      assert.equal((await cancelled).isError, true);
      assert.equal(drained, true, 'Cancellation must drain the nested body');
      delayed = false;
    }
    await fiber.dispose();
    for (const name of ['collab_dev_plan', 'collab_dev_start', 'collab_dev_status']) assert.equal(ctx.tools.get(name), undefined);
    assert.ok(!(await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'collab-dev:workflow'));
  }
  const require = createRequire(import.meta.url);
  const members = await import(pathToFileURL(path.join(path.dirname(require.resolve('@nanmicoder/dsh-agent-teams/package.json')), 'lib/members.js')).href);
  const legacy = { provider: 'old-provider', model: 'old-model' };
  const pending = { provider: 'selected-provider', model: 'selected-model' };
  const captain = { session: { requestHeader: () => ({ config: legacy }) }, options: legacy };
  if (modern) {
    const { AgentModel } = await import('@deepseek-ai/dsh-agent');
    captain.model = new AgentModel(() => ({ pending, lastUsed: legacy }), {}, legacy);
  }
  const selected = await members.resolveMemberLlmSelection({ llm: { resolveCallConfig: async value => value } }, captain, {}, new AbortController().signal);
  assert.equal(selected.provider, modern ? pending.provider : legacy.provider);
  assert.equal(selected.model, modern ? pending.model : legacy.model);
  if (modern) {
    releaseExecutor();
    const { PtcExecutor } = await import('@deepseek-ai/dsh-tool-executor-ptc');
    const runtime = new Service(ctx, 'ptcRuntime');
    Object.assign(runtime, { language: 'typescript', isolation: 'scripted-test-backend', programFormat: 'function-body', retainsState: false,
      resolve: request => ({ ...request, cwd: process.cwd(), timeoutMs: null }),
      run: async spec => {
        try { return { logs: [], value: await spec.bindings[0].functions.collab_dev_status({}) }; }
        catch (error) { return { logs: [], error: { kind: 'exception', message: error.message } }; }
      },
    });
    const directories = new Service(ctx, 'workingDirectory');
    directories.ensure = async () => process.cwd();
    agent.session.append = () => ({ seq: ++sequence });
    ctx.tools.setExecutor(new PtcExecutor(ctx));
    const fiber = ctx.plugin(plugin);
    await fiber.await();
    const direct = await invoke();
    assert.equal(direct.isError, true, 'PTC must reject a native model-direct call');
    const signal = new AbortController().signal;
    const toolSet = await ctx.tools.resolve({ agent, signal, modelSelection: { provider: 'fixture', model: 'fixture' } });
    try {
      const result = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: ToolCallId('ptc-outer'), name: 'run_code', arguments: JSON.stringify({ code: 'return await tools.collab_dev_status({});', description: 'Check collaboration status' }) }], agent, signal, toolSet });
      assert.equal(result.results[0].result.isError, false, JSON.stringify(result));
      assert.equal(result.results[0].result.value.result.team_id, 'test-team');
    } finally { toolSet.dispose(); }
    await fiber.dispose();
    console.log('PTC executor nested wrapper dispatch passed with a scripted program backend; direct native root call remained denied.');
  }
  console.log(`Host wrapper checks passed (${modern ? 'native pipeline + conditional admission' : 'legacy single-call executor'}): registration, prompt, status dispatch, main-session guard, unload/reload.`);
} finally { await ctx.fiber.dispose(); }
