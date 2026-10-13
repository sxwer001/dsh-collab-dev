import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validatePlan, savePlan, loadPlan, taskArguments } from '../src/plan.js';

const sample = JSON.parse(await readFile(new URL('../examples/plan.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(sample);

test('complete independent quality DAG is ordered and maps review and dependency IDs', () => {
  const shuffled = copy(); shuffled.tasks.reverse();
  const plan = validatePlan(shuffled), ids = Object.create(null);
  for (const task of plan.tasks) {
    const args = taskArguments(task, ids);
    assert.ok(args.dependencies.every(id => Object.values(ids).includes(id)));
    if (task.reviewedTaskId) assert.equal(args.reviewedTaskId, ids[task.reviewedTaskId]);
    ids[task.id] = 't-' + task.id;
  }
  assert.equal(plan.tasks[0].id, 'requirements');
  assert.equal(plan.tasks.at(-1).id, 'integration');
});

test('cycles, missing dependencies and parallel writer conflicts fail before dispatch', () => {
  const cycle = copy(); cycle.tasks[0].dependencies = ['integration'];
  assert.throws(() => validatePlan(cycle), /循环/);
  const missing = copy(); missing.tasks[1].dependencies.push('nonexistent');
  assert.throws(() => validatePlan(missing), /不存在/);
  for (const scope of ['src/server/orders', 'SRC/server/orders/children', 'src//server/orders']) {
    const collision = copy(); collision.tasks[2].inScope = [scope];
    assert.throws(() => validatePlan(collision), /重叠/);
  }
  const serial = copy(); serial.tasks[2].inScope = ['src/server/orders']; serial.tasks[2].dependencies.push('api');
  assert.doesNotThrow(() => validatePlan(serial));
  const indirect = copy(); indirect.tasks[2].inScope = ['src/server/orders']; indirect.tasks[2].dependencies.push('verify-api');
  assert.throws(() => validatePlan(indirect), /直接依赖/);
});

test('review must be independent, verified and included in final integration', () => {
  const self = copy(); self.tasks[5].assignee = 'worker-a';
  assert.throws(() => validatePlan(self), /reviewer/);
  const unverified = copy(); unverified.tasks[5].dependencies = ['api'];
  assert.throws(() => validatePlan(unverified), /依赖其验证/);
  const omitted = copy(); omitted.tasks.at(-1).dependencies = ['review-api'];
  assert.throws(() => validatePlan(omitted), /最终集成|纳入最终集成/);
  const fake = copy(); fake.tasks[1].verify = [];
  assert.throws(() => validatePlan(fake), /真实验证命令/);
});

test('write scopes reject traversal, drive paths and protected directories', () => {
  for (const scope of ['../other', '/tmp/file', 'C:/secret', 'src/../../other', '.git/config', '.env', 'node_modules/pkg', '.collab-dev/plan', 'src\\module', './src', 'src/**', 'src/module.', 'src/module /file']) {
    const plan = copy(); plan.tasks[1].inScope = [scope];
    assert.throws(() => validatePlan(plan), /修改范围/);
  }
});

test('plan artifacts are immutable, owner-scoped and reject children and symlink redirection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'collab-plan-'));
  try {
    const agent = { id: 'root', session: { header: { cwd: root } } };
    const first = await savePlan(agent, copy()), second = await savePlan(agent, copy());
    assert.notEqual(first.plan_id, second.plan_id);
    const restored = await loadPlan(agent, first.plan_id);
    assert.equal(restored.plan.tasks.length, 8);
    assert.match(await readFile(path.join(first.directory, 'ARCHITECTURE.md'), 'utf8'), /GET \/api\/orders/);
    await assert.rejects(loadPlan({ ...agent, id: 'other-root' }, first.plan_id), /ENOENT/);
    await assert.rejects(savePlan({ id: 'child', session: { header: { cwd: root, parentSession: 'root' } } }, copy()), /主会话/);
    await assert.rejects(loadPlan(agent, '../outside'), /计划编号/);
    const redirected = await mkdtemp(path.join(root, 'redirect-'));
    const foreign = { id: 'foreign', session: { header: { cwd: redirected } } };
    await symlink(path.join(root, '.collab-dev'), path.join(redirected, '.collab-dev'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(savePlan(foreign, copy()), /junction|符号链接/);
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    await rm(root, { recursive: true, force: true });
  }
});
