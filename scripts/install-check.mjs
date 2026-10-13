import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const target = process.argv[2] ?? path.join(root, `dsh-collab-dev-${version}.tgz`);
const base = path.join(root, '.scratch', 'install-' + Date.now());
const home = path.join(base, 'home');
await mkdir(home, { recursive: true });
const userconfig = path.join(base, 'empty.npmrc'); await writeFile(userconfig, 'registry=https://registry.npmjs.org/\n');
const bin = path.join(root, '.test-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js');
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC,
  TEMP: process.env.TEMP, TMP: process.env.TMP, LOCALAPPDATA: process.env.LOCALAPPDATA,
  USERPROFILE: home, HOME: home, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', npm_config_userconfig: userconfig };
async function command(args, label) {
  const child = spawn(process.execPath, [bin, ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', value => { stdout += value; if (label === 'install') process.stdout.write(value); });
  child.stderr.on('data', value => { stderr += value; process.stderr.write(value); });
  const timer = setTimeout(() => child.kill(), 120_000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  await writeFile(path.join(base, label + '.stdout.log'), stdout); await writeFile(path.join(base, label + '.stderr.log'), stderr);
  assert.equal(code, 0, `${label} failed`);
  return stdout;
}
await command(['plugin', '--profile', 'collab-check', 'add', target], 'install');
const profile = path.join(home, 'profiles/collab-check');
const manifest = JSON.parse(await readFile(path.join(profile, 'package.json'), 'utf8'));
assert.ok(manifest.dsh.profile.bundles.includes('dsh-collab-dev'));
const config = await command(['--profile', 'collab-check', '--dump-config'], 'composition');
assert.match(config, /dsh-collab-dev/); assert.match(config, /@nanmicoder\/dsh-agent-teams/);
const require = createRequire(path.join(profile, 'package.json'));
const entry = require.resolve('dsh-collab-dev');
const directory = path.dirname(path.dirname(entry));
const installed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
assert.equal(installed.version, version);
assert.equal(await readFile(entry, 'utf8'), await readFile(path.join(root, 'src/index.js'), 'utf8'));
assert.equal(await readFile(path.join(directory, 'src/plan.js'), 'utf8'), await readFile(path.join(root, 'src/plan.js'), 'utf8'));
assert.equal(await readFile(path.join(directory, 'src/status.js'), 'utf8'), await readFile(path.join(root, 'src/status.js'), 'utf8'));
const dependency = path.join(directory, 'node_modules/@nanmicoder/dsh-agent-teams/lib');
assert.match(await readFile(path.join(dependency, 'quality-gates.js'), 'utf8'), /taskKindOf\(task\) === 'requirements' \? task : undefined/);
assert.match(await readFile(path.join(dependency, 'tools.js'), 'utf8'), /协作计划尚未完整创建，不能批准运行/);
await writeFile(path.join(base, 'result.json'), JSON.stringify({ passed: true, profile, packageDirectory: directory,
  version: installed.version, dependency: installed.dependencies['@nanmicoder/dsh-agent-teams'] }, null, 2));
console.log('INSTALL_CHECK_OK ' + base);
