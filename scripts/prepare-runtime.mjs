import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const host = path.resolve(process.argv[2] || '../dsh-context-control/.test-runtime/node_modules');
const nodeModules = path.join(root, '.test-runtime', 'node_modules');
const nanoSource = path.resolve(process.argv[3] || '../_research/dsh-subagent-feasibility-20261012/dsh-agent-teams');
const hostMeta = JSON.parse(await fs.readFile(path.join(host, '@deepseek-ai/dsh/package.json'), 'utf8'));
const nanoMeta = JSON.parse(await fs.readFile(path.join(nanoSource, 'package.json'), 'utf8'));
if (hostMeta.version !== '0.2.0-rc.2' || nanoMeta.version !== '0.1.23') throw new Error('测试必须使用固定的 DSH 0.2.0-rc.2 与 AgentTeams 0.1.23。');
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
await fs.mkdir(nanoTarget, { recursive: true });
for (const name of ['lib', 'assets', 'scripts', 'package.json', 'cordis.patch.yml', 'LICENSE']) {
  await fs.cp(path.join(nanoSource, name), path.join(nanoTarget, name), { recursive: true });
}
const resolver = path.join(root, 'node_modules');
try { await fs.lstat(resolver); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await fs.symlink(nodeModules, resolver, process.platform === 'win32' ? 'junction' : 'dir');
}
await import('./patch-agent-teams.mjs');
let sourceCommit;
try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: nanoSource, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { sourceCommit = null; }
await fs.writeFile(path.join(root, '.test-runtime', 'source.json'), JSON.stringify({ host: hostMeta.version, agentTeams: nanoMeta.version, sourceCommit, sourceType: sourceCommit ? 'pinned GitHub built artifacts' : 'published npm tarball' }, null, 2));
console.log('已准备隔离的固定版本测试依赖；未修改宿主或用户 profile。');
