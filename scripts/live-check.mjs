// Opt-in real model check: uses the installed plugin and native credential resolution.
import { mkdir, readFile, writeFile, symlink, lstat, unlink } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const liveHome = path.join(os.homedir(), '.dsh');
const liveProfile = path.join(liveHome, 'profiles/desktop');
const packageRoot = process.env.COLLAB_PACKAGE_ROOT ? path.resolve(process.env.COLLAB_PACKAGE_ROOT) : path.join(liveProfile, 'node_modules/dsh-collab-dev');
const runtime = path.join(root, '.test-runtime/node_modules');
const mode = process.argv[2] ?? 'development';
const continuing = ['resume', 'binding'].includes(mode);
const base = continuing ? path.resolve(process.argv[3]) : path.join(root, '.scratch', `live-${mode}-${Date.now()}`);
if (continuing && (path.dirname(base) !== path.join(root, '.scratch') || !path.basename(base).startsWith('live-development-'))) throw new Error('Resume only a task-owned development check');
const home = path.join(base, 'home'), profile = path.join(home, 'profiles/collab-live');
const workspace = path.join(base, 'workspace');
await mkdir(path.join(profile, 'node_modules'), { recursive: true });
await mkdir(workspace, { recursive: true });
const patches = [];
for (const file of [path.join(liveProfile, 'cordis.patch.yml'), path.join(liveHome, 'cordis.patch.yml')]) {
  try { patches.push(...YAML.parseDocument(await readFile(file, 'utf8'), { logLevel: 'silent' }).toJS()); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const selection = patches.filter(row => row.id === 'agent-default-model').at(-1)?.config;
const providers = patches.filter(row => row.id === 'llm-pi-ai').at(-1)?.config;
if (!selection?.provider || !selection?.model || !providers) throw new Error('Missing live model route');
if (selection.provider !== 'opencode-go') throw new Error('This check currently expects the configured opencode-go route');
// Do not persist inline secrets. The current route uses only a credential reference.
if (Object.values(providers.providers ?? {}).some(provider => provider.apiKey || provider.headers || provider.env)) throw new Error('Inline provider credentials must remain in the native profile');
const links = [
  ['@deepseek-ai', path.join(runtime, '@deepseek-ai')],
  ['@nanmicoder', path.join(packageRoot, 'node_modules/@nanmicoder')],
  ['dsh-collab-dev', packageRoot],
  ['dsh-opencode-go-model-list', path.join(liveProfile, 'node_modules/dsh-opencode-go-model-list')],
];
if (!continuing) for (const [name, target] of links) await symlink(target, path.join(profile, 'node_modules', name), process.platform === 'win32' ? 'junction' : 'dir');
else {
  const link = path.join(profile, 'node_modules/@nanmicoder');
  if (!(await lstat(link)).isSymbolicLink()) throw new Error('Refuse to replace a non-link dependency directory');
  await unlink(link);
  await symlink(links.find(([name]) => name === '@nanmicoder')[1], link, process.platform === 'win32' ? 'junction' : 'dir');
}
await writeFile(path.join(profile, 'package.json'), JSON.stringify({ private: true, type: 'module', dsh: { profile: {
  bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', 'dsh-opencode-go-model-list', 'dsh-collab-dev'], patchReload: 'startup',
} } }));
await writeFile(path.join(profile, 'cordis.patch.yml'), JSON.stringify([
  { id: 'headless-startup', disabled: true }, { id: 'headless-runner', disabled: true },
  { id: 'agent-default-model', config: selection }, { id: 'llm-pi-ai', config: providers },
  { id: 'credentials', config: { path: path.join(liveHome, '.credentials.yaml'), watch: false } },
  { id: 'opencode-go-model-list', config: { offline: true, refreshIntervalMs: 0, cachePath: path.join(liveHome, 'cache/opencode-go-model-list/catalog.json') } },
  { id: 'agent-teams', config: JSON.parse(await readFile(path.join(packageRoot, 'cordis.patch.yml'), 'utf8'))[0].insert[0].config },
  { insert: [{ id: 'live-check-driver', name: path.join(root, 'test/live-driver.mjs').replaceAll('\\', '/') }] },
], null, 2));
await writeFile(path.join(base, 'selection.json'), JSON.stringify(selection));
await writeFile(path.join(workspace, 'AGENTS.md'), `This is a disposable real-model collaboration test. Use Node.js ES modules and node:test only. Never read credentials or user configuration; never install packages, commit, push or deploy. Work only in this workspace. The main agent owns shared scaffolding; workers own disjoint module/test files. Report actual failures honestly.\n`);
const env = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT, PSModulePath: process.env.PSModulePath,
  SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC, TEMP: process.env.TEMP, TMP: process.env.TMP,
  USERPROFILE: home, HOME: home, DSH_HOME: home, DSH_PERMISSION_MODE: 'danger-full-access', DSH_TELEMETRY_DISABLED: '1',
  COLLAB_LIVE_BASE: base, COLLAB_LIVE_MODE: mode };
if (process.platform === 'win32') execFileSync('pwsh', ['-NoProfile', '-Command', "if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'node is not resolvable' }; node --version"], { env, cwd: workspace, timeout: 10_000 });
console.log(`LIVE_CHECK_STARTED ${base} ${selection.provider}/${selection.model}`);
const child = spawn(process.execPath, [path.join(runtime, '@deepseek-ai/dsh/lib/bin.js'), '--profile', 'collab-live'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.on('data', value => { stdout += value; process.stdout.write(value); });
child.stderr.on('data', value => { stderr += value; process.stderr.write(value); });
const timer = setTimeout(() => child.kill(), mode === 'smoke' ? 180_000 : 2_100_000);
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
await writeFile(path.join(base, 'stdout.log'), stdout); await writeFile(path.join(base, 'stderr.log'), stderr);
console.log(`LIVE_CHECK_EXIT ${code} ${base}`);
process.exitCode = code ?? 1;
