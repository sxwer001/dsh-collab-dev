import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStatus, renderStatus } from '../src/status.js';

const snapshot = () => ({ team_id: 'team', profile: { name: 'collab-dev' }, phase: 'running',
  deliverable: true, delivery: { ok: true, blockers: [], warnings: [] }, members: [],
  tasks: [
    { id: 't1', subject: 'Verify', kind: 'verification', status: 'completed', output: 'node --test: exit 0' },
    { id: 't2', subject: 'Integrate', kind: 'integration', status: 'completed', output: 'smoke: exit 0' },
  ] });

test('delivery follows native gates, never a completion count; repaired failures remain visible', () => {
  assert.equal(summarizeStatus(snapshot()).deliverable, true);
  for (const changes of [{ phase: 'staged' }, { halted: true }, { deliverable: false },
    { delivery: { ok: false, blockers: ['Review is stale'], warnings: [] } }, { tasks: [] }]) {
    assert.equal(summarizeStatus({ ...snapshot(), ...changes }).deliverable, false);
  }
  const repaired = snapshot();
  repaired.tasks.push({ id: 'old', kind: 'verification', status: 'failed', output: 'Historical failure repaired by a subsequent task' });
  const result = summarizeStatus(repaired);
  assert.equal(result.deliverable, true);
  assert.equal(result.counts.failed, 1);
  assert.match(renderStatus(result), /失败记录/);
});

test('status preserves test results and gate blockers and refuses unknown or incomplete evidence', () => {
  const value = snapshot();
  value.tasks[0].status = 'failed'; value.tasks[0].output = 'node --test: exit 1'; value.tasks[1].status = 'pending';
  value.deliverable = false; value.delivery = { ok: false, blockers: ['Verification failed'], warnings: ['Review must be repeated'] };
  const summary = summarizeStatus(value), text = renderStatus(summary);
  assert.equal(summary.tests.length, 2);
  assert.match(text, /exit 1/); assert.match(text, /Verification failed/); assert.match(text, /Review must be repeated/);
  assert.throws(() => summarizeStatus({ ...value, delivery: undefined }), /交付检查缺失/);
  assert.throws(() => summarizeStatus({ ...value, profile: { name: 'other' } }), /不是 collab-dev/);
  assert.throws(() => summarizeStatus({ ...value, tasks: [{ status: 'mystery' }] }), /未知任务状态/);
});
