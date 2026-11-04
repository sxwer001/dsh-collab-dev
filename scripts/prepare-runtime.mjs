import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const host = path.resolve(process.argv[2] || '../dsh-context-control/node_modules');
const nanoSource = path.resolve(process.argv[3] || 'node_modules/@nanmicoder/dsh-agent-teams');
const hostMeta = JSON.parse(await fs.readFile(path.join(host, '@deepseek-ai/dsh/package.json'), 'utf8'));
const nanoMeta = JSON.parse(await fs.readFile(path.join(nanoSource, 'package.json'), 'utf8'));
const pluginMeta = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!pluginMeta.engines.dsh.split(' || ').includes(hostMeta.version) || nanoMeta.version !== pluginMeta.dependencies['@nanmicoder/dsh-agent-teams']) throw new Error('测试宿主必须匹配 engines.dsh，AgentTeams 必须匹配固定依赖版本。');
const nodeModules = path.join(root, '.test-runtime', `${hostMeta.version}-agent-teams-${nanoMeta.version}`, 'node_modules');
await fs.mkdir(nodeModules, { recursive: true });
for (const name of await fs.readdir(host)) {
  if (name === '@nanmicoder' || name === '.bin') continue;
  const target = path.join(nodeModules, name);
  try { await fs.lstat(target); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.symlink(path.join(host, name), target, process.platform === 'win32' ? 'junction' : 'dir');
  }
}
const nanoTarget = path.join(nodeModules, '@nanmicoder', 'dsh-agent-teams');
if (await fs.realpath(nanoSource) !== nanoTarget) await fs.cp(nanoSource, nanoTarget, {
  recursive: true, filter: source => !['node_modules', '.git'].includes(path.basename(source)),
});
const resolver = path.join(root, 'node_modules');
let existing;
try { existing = await fs.lstat(resolver); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  if (!existing.isSymbolicLink() || !path.resolve(root, await fs.readlink(resolver)).startsWith(path.join(root, '.test-runtime') + path.sep)) throw new Error('请在干净 checkout 准备运行时，或先移走现有项目 node_modules。');
  await fs.unlink(resolver);
}
await fs.symlink(nodeModules, resolver, process.platform === 'win32' ? 'junction' : 'dir');
await import('./patch-agent-teams.mjs');
let sourceCommit;
try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: nanoSource, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { sourceCommit = null; }
await fs.writeFile(path.join(root, '.test-runtime', 'source.json'), JSON.stringify({ host: hostMeta.version, agentTeams: nanoMeta.version, sourceCommit, sourceType: sourceCommit ? 'pinned GitHub built artifacts' : 'published npm tarball' }, null, 2));
console.log(`已准备隔离依赖：DSH ${hostMeta.version} / AgentTeams ${nanoMeta.version}；未修改宿主或用户 profile。`);
