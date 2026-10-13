import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const packageRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
const runtime = path.join(root, '.test-runtime/node_modules');
const report = path.join(root, '.scratch', 'runtime-' + Date.now());
const checks = [];
for (const scenario of ['success', 'failure']) {
  const base = path.join(report, scenario), home = path.join(base, 'home'), profile = path.join(home, 'profiles/headless'), workspace = path.join(base, 'workspace');
  await mkdir(path.join(profile, 'node_modules'), { recursive: true }); await mkdir(workspace, { recursive: true });
  await symlink(packageRoot, path.join(profile, 'node_modules/dsh-collab-dev'), process.platform === 'win32' ? 'junction' : 'dir');
  const bundled = path.join(packageRoot, 'node_modules/@nanmicoder');
  await symlink(existsSync(bundled) ? bundled : path.join(runtime, '@nanmicoder'), path.join(profile, 'node_modules/@nanmicoder'), process.platform === 'win32' ? 'junction' : 'dir');
  await symlink(path.join(runtime, '@deepseek-ai'), path.join(profile, 'node_modules/@deepseek-ai'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({ name: 'collab-runtime-test', private: true, type: 'module',
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', 'dsh-collab-dev'], patchReload: 'startup' } } }));
  await writeFile(path.join(profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'llm-deepseek', disabled: true }, { id: 'llm-pi-ai', disabled: true },
    { id: 'agent-default-model', config: { provider: 'collab-fixture', model: 'fixture' } },
    { id: 'headless-startup', disabled: true }, { id: 'headless-runner', disabled: true },
    { insert: [{ id: 'fixture-client-modules', name: '@deepseek-ai/dsh-client-modules' },
      { id: 'fixture', name: path.join(root, 'test/runtime-fixture.mjs').replaceAll('\\', '/') }] },
  ]));
  await writeFile(path.join(workspace, 'check.mjs'), `import {readFileSync} from 'node:fs';\nif(process.argv.includes('--fail')) throw new Error('Expected validation failure');\nfor(const name of process.argv[2]==='all'?['a','b']:[process.argv[2]]) { if(readFileSync('modules/'+name+'.txt','utf8')!==name) throw new Error('Invalid module '+name); }\nconsole.log('Actual file validation passed');\n`);
  const trace = path.join(base, 'trace.jsonl');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC, TEMP: process.env.TEMP, TMP: process.env.TMP,
    USERPROFILE: home, HOME: home, DSH_HOME: home, DSH_PERMISSION_MODE: 'danger-full-access', DSH_TELEMETRY_DISABLED: '1',
    COLLAB_TRACE: trace, COLLAB_PLAN: path.join(root, 'examples/plan.json'), COLLAB_SCENARIO: scenario };
  const child = spawn(process.execPath, [path.join(runtime, '@deepseek-ai/dsh/lib/bin.js'), '--profile', 'headless'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
  const timer = setTimeout(() => child.kill(), 65_000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  await writeFile(path.join(base, 'stdout.log'), stdout); await writeFile(path.join(base, 'stderr.log'), stderr);
  console.log(`${scenario}: exit ${code}; evidence ${base}`);
  if (code !== 0) { console.error(stderr.slice(-8000)); console.error(stdout.slice(-2500)); }
  assert.equal(code, 0, 'Real Harness fixture failed'); assert.match(stdout, /COLLAB_RUNTIME_OK/);
  const events = (await readFile(trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(events.some(event => event.event === 'staged' && event.noMembersStarted));
  const starts = events.filter(event => event.event === 'check-start' && event.kind === 'implementation');
  const ends = events.filter(event => event.event === 'check-end' && event.kind === 'implementation');
  assert.equal(starts.length, 2); assert.ok(Math.max(...starts.map(e => e.time)) < Math.min(...ends.map(e => e.time)), 'Coding members must overlap');
  assert.ok(events.some(event => event.event === (scenario === 'success' ? 'delivery-complete' : 'failure-blocked')));
  checks.push({ scenario, passed: true, realHarness: '0.2.0-rc.2', agentTeams: '0.1.23', scriptedModel: true, concurrentWorkers: 2, traceSha256: createHash('sha256').update(await readFile(trace)).digest('hex') });
}
await writeFile(path.join(report, 'results.json'), JSON.stringify(checks, null, 2));
console.log('Runtime checks passed: ' + report);
