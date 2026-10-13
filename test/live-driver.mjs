// This driver sends user-authorized test prompts; every model/tool/member is real.
import assert from 'node:assert/strict';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const name = 'collab-live-check';
export const inject = ['llm', 'agents', 'sessions', 'commands', 'tools'];
const base = process.env.COLLAB_LIVE_BASE;
const mode = process.env.COLLAB_LIVE_MODE;
const log = data => appendFileSync(path.join(base, 'trace.jsonl'), JSON.stringify({ ...data, time: Date.now() }) + '\n');
function state() {
  const directory = path.join(process.cwd(), '.agent-teams');
  if (!existsSync(directory)) return;
  const team = readdirSync(directory).find(name => name.startsWith('collab-'));
  if (team && existsSync(path.join(directory, team, 'team.json'))) return JSON.parse(readFileSync(path.join(directory, team, 'team.json'), 'utf8'));
}
const goal = `真实模型协作验收：在当前空目录完成一个最小订单金额库。只用 Node.js ES modules 和 node:test，不安装依赖。
请主智能体先检查目录并亲自建立 package.json、src/index.js、test/integration.test.js、smoke.js 等共享骨架，制定架构合同，之后让两个原生 worker 并行实现，不得由主智能体代写这两个模块。
固定接口：src/pricing.js 导出 itemTotal(unitCents, quantity)、subtotal(items)。参数金额必须非负安全整数，quantity 必须非负安全整数；结果溢出安全整数需抛 RangeError；非法参数抛 TypeError。items 是 {unitCents,quantity} 的数组；空数组总额 0。
src/shipping.js 导出 shippingFee(region, subtotalCents)。region 仅 domestic 或 international，其他值抛 TypeError；subtotalCents 非负安全整数。domestic 小于 10000 收 600，否则 0；international 始终 2000。
src/index.js 导出 quote(items,region)，返回 {subtotalCents,shippingCents,totalCents}；总额溢出抛 RangeError。主智能体实现这个共享框架，引用两个 worker 将创建的模块。集成测试覆盖普通国内订单、免运费边界、国际订单、无效输入、总额溢出。
worker-a 只修改 src/pricing.js 和 test/pricing.test.js；worker-b 只修改 src/shipping.js 和 test/shipping.test.js。每个 worker 至少 6 个用例覆盖正常、边界和错误情况。
package.json 脚本固定：test:pricing = node --test test/pricing.test.js；test:shipping = node --test test/shipping.test.js；test = node --test test/*.test.js；smoke = node smoke.js。smoke.js 对 quote([{unitCents:1200,quantity:2}], 'domestic') 检查总额 3000。
使用 collab_dev_plan 保存完整 8 个任务：requirements、两个 implementation、两个 verification、两个 review、一个 integration。requirements 指派 reviewer；每个 implementation 依赖 requirements，声明上述精确两个文件范围和专属测试命令；verification 指派 verifier；review 指派 reviewer，分别引用实现并依赖其验证；integration 依赖两份 review，运行 npm test 和 npm run smoke。验收条件明确、可执行。requirements 审查共享接口与任务合同，不要求尚未创建的 worker 模块能运行。
使用 collab_dev_start 创建完整团队草稿，展示计划并结束本轮。稍后的测试控制器会根据用户已经授权的真实模型测试发送批准运行消息。必须实际调用工具，不得只给出代码建议。`;

export function apply(ctx) {
  let requests = 0, rootId;
  const errors = [];
  ctx.on('agent/turn-error', ({ agent, error }) => { const value = { event: 'turn-error', agent: agent?.id, code: error?.code, message: String(error?.message ?? error).slice(0,600) }; errors.push(value); log(value); console.log(JSON.stringify(value)); });
  ctx.on('llm/stream', (options, next) => {
    const number = ++requests;
    log({ event: 'model-request', number, agent: options.sessionId, provider: options.provider, model: options.model, purpose: options.purpose });
    return (async function* () {
      for await (const chunk of next()) {
        if (chunk.type === 'block-end' && chunk.block?.type === 'tool-call') { log({ event: 'model-tool', number, agent: options.sessionId, name: chunk.block.name }); console.log(`MODEL_TOOL ${options.sessionId} ${chunk.block.name}`); }
        if (chunk.type === 'finish') log({ event: 'model-finish', number, agent: options.sessionId, reason: chunk.reason.kind, failureCode: chunk.reason.failure?.code, usage: chunk.usage });
        yield chunk;
      }
    })();
  }, { global: true });
  void (async () => {
    await ctx.get('loader').await();
    const selection = JSON.parse(readFileSync(path.join(base, 'selection.json'), 'utf8'));
    // The live model catalog initializes asynchronously from its existing public cache.
    for (let i = 0; ; i++) {
      try { await ctx.llm.resolveModelInfo(selection.provider, selection.model); break; }
      catch (error) { if (i >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    const handle = ['resume', 'binding'].includes(mode)
      ? await ctx.agents.resume({ resumeSessionId: state().captainSessionId, agentOptions: { ...selection, maxTokens: 10000 } })
      : await ctx.agents.create({ sessionId: 'collab-live-' + randomUUID(), meta: { cwd: process.cwd() }, agentOptions: { ...selection, maxTokens: 10000 } });
    rootId = handle.agent.id; ctx.effect(() => () => handle.dispose());
    const send = async text => { handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })); await handle.agent.whenIdle(); };
    const transcript = () => handle.agent.session.deriveMessages().filter(message => message.role === 'assistant').flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text)).join('\n\n');
    if (mode === 'smoke') {
      await send('Reply exactly LIVE_MODEL_OK. Do not call any tools.');
      assert.equal(errors.length, 0); assert.match(transcript(), /LIVE_MODEL_OK/);
      writeFileSync(path.join(base, 'result.json'), JSON.stringify({ passed: true, selection, requests, realModel: true }, null, 2));
      console.log('LIVE_MODEL_OK'); ctx.get('appExit')(0); return;
    }
    if (mode === 'binding') {
      const saved = readdirSync(path.join(process.cwd(), '.collab-dev')).flatMap(owner => readdirSync(path.join(process.cwd(), '.collab-dev', owner)).map(id => `.collab-dev/${owner}/${id}`))[0];
      await send(`用户授权测试修复后的需求快照绑定。保留原有全部已完成任务，新增一项 kind=requirements 的独立审查任务，指派 reviewer，subject 固定为「Snapshot binding regression」，dependencies=["t1"]，inScope=["${saved}/ARCHITECTURE.md","${saved}/plan.json"]，验收要求实际阅读这两个不可变文件并确认它们是本团队保存的架构与完整计划，不重新实现产品或重做测试。让 reviewer 以当前 attempt_id、verdict=pass 正式完成。无需降低任何门禁。`);
      const deadline = Date.now() + 600_000;
      let task;
      while (Date.now() < deadline) {
        task = state().tasks.find(item => item.subject === 'Snapshot binding regression');
        if (task?.status === 'completed') break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      assert.equal(task?.status, 'completed'); assert.ok(task.reviewedArtifacts?.length >= 2);
      writeFileSync(path.join(base, 'binding-result.json'), JSON.stringify({ passed: true, realModel: true, task: task.id, artifacts: task.reviewedArtifacts, attempt: task.attempt }, null, 2));
      console.log('LIVE_BINDING_OK'); ctx.get('appExit')(0); return;
    }
    if (mode !== 'resume') {
    const activated = await ctx.commands.execute(handle.agent, '/collab-dev ' + goal, [], new AbortController().signal);
    assert.equal(activated?.result.kind, 'success'); await handle.agent.whenIdle();
    // Allow a small corrective turn for model-side schema mistakes, without inventing its plan.
    if (!state()?.tasks?.length || state().tasks.length < 8) {
      await send('本次验收需要你实际调用 collab_dev_plan 与 collab_dev_start 完成全部 8 个任务的团队草稿。若工具报错，请按工具返回修正计划；当前目录已有草稿时先检查并丢弃未完成的 staged 团队，再创建正确草稿。不得批准或开始执行。');
    }
    const staged = state();
    assert.equal(staged?.phase, 'staged'); assert.equal(staged.tasks.length, 8);
    assert.ok(staged.members.every(member => !member.id), 'Planning must not start children');
    const stagedStatus = await ctx.commands.execute(handle.agent, '/collab-status', [], new AbortController().signal);
    assert.equal(stagedStatus?.result.kind, 'success');
    assert.match(stagedStatus.result.text, /等待批准/);
    writeFileSync(path.join(base, 'captain-plan.md'), transcript()); log({ event: 'staged', team: staged.id, tasks: staged.tasks.length, noMembersStarted: true });
    console.log('LIVE_PLAN_STAGED');
    await send('用户已授权此次真实模型测试。现在批准这份完整团队计划，请调用 agent_teams_approve 运行。之后等待成员执行，仅用原生工具协调并修复阻塞；不要替 worker 编写产品模块，也不要取消测试、降低标准或虚报结果。');
    } else {
      log({ event: 'test-resumed', captain: rootId });
      await send('用户要求继续修复并完成本次真实模型验收。测试控制器此前因计时时限退出，已有 7 个任务完成、集成 t8 尚未正式完成。请调用 agent_teams_status 恢复原团队的冷恢复执行；不要新建团队、不要重做已完成任务。保留测试与审查标准，继续完成剩余集成，提交 acceptanceResults 和 commandsRun；首次完成不要使用 evidence_note。');
    }
    const previous = new Map(), began = Date.now();
    let final, lastProgress = '';
    while (Date.now() - began < 1_800_000) {
      final = state();
      for (const task of final.tasks) if (previous.get(task.id) !== task.status) {
        previous.set(task.id, task.status); log({ event: 'task-status', id: task.id, kind: task.kind, assignee: task.assignee, status: task.status, attempt: task.attemptId });
      }
      const progress = final.tasks.map(task => `${task.kind}:${task.status}`).join(' ');
      if (progress !== lastProgress) { console.log('LIVE_PROGRESS ' + progress); lastProgress = progress; }
      if (final.tasks.filter(task => task.kind === 'integration').some(task => task.status === 'completed')) break;
      if (errors.some(error => error.code && /CREDENTIAL|QUOTA|SIGN_IN/.test(error.code))) throw new Error('Native provider blocked: ' + errors.at(-1).code);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(final.tasks.some(task => task.kind === 'integration' && task.status === 'completed'), 'Integration did not complete');
    await send('请调用 collab_dev_status 核对结果，然后在 TEST_SUMMARY.md 写测试汇总：列明主智能体架构文件、两个并行 worker 的实际改动、真实执行的测试命令与退出码、审查和修复结果。亲自重跑 npm test 与 npm run smoke，失败继续协调修复。只报告有证据的结论。');
    const status = await ctx.commands.execute(handle.agent, '/collab-status', [], new AbortController().signal);
    assert.equal(status?.result.kind, 'success');
    assert.match(status.result.text, /可交付/);
    writeFileSync(path.join(base, 'status-summary.txt'), status.result.text);
    final = state();
    writeFileSync(path.join(base, 'captain-summary.md'), transcript());
    const testOutput = execFileSync(process.execPath, ['--test', ...readdirSync(path.join(process.cwd(), 'test')).filter(file => file.endsWith('.test.js')).map(file => 'test/' + file)], { encoding: 'utf8', cwd: process.cwd(), timeout: 60_000 });
    const smokeOutput = execFileSync(process.execPath, ['smoke.js'], { encoding: 'utf8', cwd: process.cwd(), timeout: 30_000 });
    writeFileSync(path.join(base, 'independent-tests.log'), testOutput); writeFileSync(path.join(base, 'independent-smoke.log'), smokeOutput);
    assert.ok(existsSync(path.join(process.cwd(), 'TEST_SUMMARY.md')));
    const events = readFileSync(path.join(base, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const implementation = final.tasks.filter(task => task.kind === 'implementation');
    const intervals = implementation.map(task => ({ id: task.id, assignee: task.assignee, start: events.find(event => event.event === 'task-status' && event.id === task.id && ['claimed','in_progress'].includes(event.status))?.time,
      end: events.find(event => event.event === 'task-status' && event.id === task.id && ['completed','failed'].includes(event.status))?.time }));
    assert.equal(intervals.length, 2); assert.ok(intervals.every(interval => interval.start && interval.end));
    const overlapMs = Math.min(...intervals.map(interval => interval.end)) - Math.max(...intervals.map(interval => interval.start));
    assert.ok(overlapMs > 0, 'Native coding tasks must overlap');
    assert.ok(final.members.filter(member => member.name.startsWith('worker-')).every(member => events.some(event => event.event === 'model-request' && event.agent === member.id && event.model === selection.model)));
    await ctx.sessions.flush(handle.agent.session);
    const result = { passed: true, realModel: true, selection, requests: events.filter(event => event.event === 'model-request').length, rootId, teamId: final.id, workspace: process.cwd(), overlapMs, intervals, errors,
      tasks: final.tasks.map(task => ({ id: task.id, kind: task.kind, assignee: task.assignee, status: task.status, commandsRun: task.commandsRun, output: task.output })) };
    writeFileSync(path.join(base, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`LIVE_DEVELOPMENT_OK overlap=${overlapMs}ms requests=${requests}`); ctx.get('appExit')(0);
  })().catch(error => { log({ event: 'check-error', message: error.message }); console.error(error.stack); ctx.get('appExit')(1); });
}
