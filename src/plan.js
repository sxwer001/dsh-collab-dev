import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, writeFile, rename, rm, readFile } from 'node:fs/promises';
import path from 'node:path';

export const MEMBERS = ['worker-a', 'worker-b', 'verifier', 'reviewer'];
const KINDS = ['requirements', 'implementation', 'verification', 'review', 'integration'];
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const PLAN_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LIMIT = 128_000;

function text(value, label, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) {
    throw new Error(`${label} 必须是非空文本，长度不超过 ${max}。`);
  }
  return value.trim();
}

function strings(value, label, { required = true, max = 24 } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > max || (required && !value.length)) {
    throw new Error(`${label} 必须包含 1 至 ${max} 项。`);
  }
  return value.map(item => text(item, label, 2000));
}

function scope(value) {
  const result = text(value, 'inScope', 240);
  if (result.startsWith('/') || result.includes('\\') || result.includes(':') ||
      /[?*\[\]{}<>"|\x00-\x1f]/.test(result) || result.split('/').some(part => part === '..' || part === '.' || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
      /(^|\/)(\.git|\.agent-teams|\.collab-dev|node_modules|\.env(?:\.[^/]+)?)(\/|$)/i.test(result)) {
    throw new Error(`修改范围必须是工作区相对路径，且不能指向受保护目录：${result}`);
  }
  return result.replace(/\/+/g, '/').replace(/\/+$/, '');
}

function overlaps(a, b) {
  // ponytail: conservatively case-fold on every OS so a plan is safe to move to Windows.
  a = a.toLowerCase(); b = b.toLowerCase();
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

/** Validate a complete quality DAG before creating any team or writing artifacts. */
export function validatePlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('计划必须是对象。');
  const goal = text(input.goal, 'goal');
  const architecture = text(input.architecture, 'architecture', 12_000);
  const constraints = strings(input.constraints, 'constraints', { required: false });
  if (!Array.isArray(input.tasks) || input.tasks.length < 5 || input.tasks.length > 24) {
    throw new Error('计划应包含 5 至 24 个需求、实现、验证、审查与集成任务。');
  }
  const tasks = input.tasks.map(item => {
    if (!item || typeof item.id !== 'string' || !ID.test(item.id)) throw new Error('任务 id 必须为 1–32 位小写字母、数字或连字符，以字母开头，例如 verify-api；不允许下划线。');
    if (!KINDS.includes(item.kind)) throw new Error(`未知任务类型：${item.kind}`);
    if (!MEMBERS.includes(item.assignee)) throw new Error(`未知成员：${item.assignee}`);
    const task = {
      id: item.id, kind: item.kind, assignee: item.assignee,
      subject: text(item.subject, 'subject', 200),
      objective: text(item.objective, 'objective'),
      dependencies: strings(item.dependencies ?? [], 'dependencies', { required: false }),
      acceptance: strings(item.acceptance, 'acceptance'),
      inScope: strings(item.inScope ?? [], 'inScope', { required: false }).map(scope),
      verify: strings(item.verify ?? [], 'verify', { required: false }),
      ...(item.reviewedTaskId ? { reviewedTaskId: text(item.reviewedTaskId, 'reviewedTaskId', 32) } : {}),
    };
    if (task.kind === 'implementation') {
      if (!task.assignee.startsWith('worker-') || !task.inScope.length || !task.verify.length) {
        throw new Error('实现任务必须分配给 worker，并提供修改范围和真实验证命令。');
      }
    } else if (task.kind === 'review' || task.kind === 'requirements') {
      if (task.assignee !== 'reviewer') throw new Error('需求和独立审查必须分配给 reviewer。');
    } else if (task.kind === 'verification' && task.assignee !== 'verifier') {
      throw new Error('验证任务必须分配给 verifier。');
    }
    if (task.kind === 'verification' && !task.verify.length) throw new Error('验证任务必须提供真实验证命令。');
    if (task.reviewedTaskId && task.kind !== 'review') throw new Error('只有独立审查任务可以设置 reviewedTaskId。');
    return task;
  });
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (byId.size !== tasks.length) throw new Error('任务 id 不能重复。');
  const ancestors = new Map(), ordered = [], visiting = new Set();
  function visit(task) {
    if (ancestors.has(task.id)) return ancestors.get(task.id);
    if (visiting.has(task.id)) throw new Error('任务依赖存在循环。');
    visiting.add(task.id);
    const upstream = new Set();
    for (const id of task.dependencies) {
      const parent = byId.get(id);
      if (!parent) throw new Error(`任务 ${task.id} 引用了不存在的依赖 ${id}。`);
      upstream.add(id);
      for (const entry of visit(parent)) upstream.add(entry);
    }
    visiting.delete(task.id); ancestors.set(task.id, upstream); ordered.push(task);
    return upstream;
  }
  for (const task of tasks) visit(task);
  for (const kind of KINDS) {
    if (!tasks.some(task => task.kind === kind)) throw new Error(`缺少 ${kind} 阶段。`);
  }
  const hasAncestor = (task, predicate) => [...ancestors.get(task.id)].some(id => predicate(byId.get(id)));
  for (const task of tasks) {
    if (task.kind === 'implementation' && !hasAncestor(task, t => t.kind === 'requirements')) {
      throw new Error(`实现 ${task.id} 必须依赖需求验收。`);
    }
    if (task.kind === 'verification' && !hasAncestor(task, t => t.kind === 'implementation')) {
      throw new Error(`验证 ${task.id} 必须依赖实现。`);
    }
    if (task.kind === 'review') {
      const implementation = byId.get(task.reviewedTaskId);
      if (implementation?.kind !== 'implementation' || !ancestors.get(task.id).has(implementation.id) ||
          !hasAncestor(task, t => t.kind === 'verification' && ancestors.get(t.id).has(implementation.id))) {
        throw new Error(`审查 ${task.id} 必须引用实现并依赖其验证。`);
      }
    }
  }
  const writes = tasks.filter(task => task.kind === 'implementation');
  for (let i = 0; i < writes.length; i++) for (const b of writes.slice(i + 1)) {
    const a = writes[i];
    if (!a.dependencies.includes(b.id) && !b.dependencies.includes(a.id) &&
        a.inScope.some(left => b.inScope.some(right => overlaps(left, right)))) {
      throw new Error(`实现 ${a.id} 与 ${b.id} 的写入范围重叠；后一个实现必须直接依赖前一个，或拆分范围。`);
    }
  }
  const integrations = tasks.filter(task => task.kind === 'integration');
  if (integrations.length !== 1) throw new Error('计划必须有且只有一个最终集成任务。');
  for (const implementation of writes) {
    const reviews = tasks.filter(task => task.kind === 'review' && task.reviewedTaskId === implementation.id);
    if (!reviews.length || !integrations.some(task => reviews.some(review => ancestors.get(task.id).has(review.id)))) {
      throw new Error(`实现 ${implementation.id} 必须经独立审查并纳入最终集成。`);
    }
  }
  for (const task of integrations) {
    if (!task.verify.length || !writes.every(t => ancestors.get(task.id).has(t.id)) ||
        !writes.every(t => hasAncestor(task, review => review.kind === 'review' && review.reviewedTaskId === t.id))) {
      throw new Error('最终集成必须覆盖全部实现、依赖每项实现的独立审查并提供验收命令。');
    }
    if (tasks.some(other => other.id !== task.id && !ancestors.get(task.id).has(other.id))) {
      throw new Error('最终集成必须覆盖计划内所有任务，不能留下未纳入交付的验证或审查。');
    }
  }
  return { schemaVersion: 1, goal, architecture, constraints, tasks: ordered };
}

export function taskArguments(task, ids) {
  return {
    subject: task.subject, description: task.objective, objective: task.objective,
    kind: task.kind, assignee: task.assignee,
    dependencies: task.dependencies.map(id => {
      if (!ids[id]) throw new Error(`尚未创建依赖 ${id}。`);
      return ids[id];
    }),
    acceptance: task.acceptance, inScope: task.inScope, verify: task.verify,
    ...(task.reviewedTaskId ? { reviewedTaskId: ids[task.reviewedTaskId] } : {}),
  };
}

export function requireMainSession(agent) {
  if (!agent?.id || !agent.session?.header || agent.session.header.parentSession) throw new Error('协作开发命令和工具仅限主会话使用。');
}

function sessionKey(agent) {
  requireMainSession(agent);
  return createHash('sha256').update(String(agent.id)).digest('hex').slice(0, 24);
}

async function planDirectory(agent) {
  sessionKey(agent);
  const cwd = agent.session.header.cwd;
  if (!cwd || !path.isAbsolute(cwd)) throw new Error('主会话缺少有效工作目录。');
  const root = await realpath(cwd);
  const base = path.join(root, '.collab-dev');
  await mkdir(base, { recursive: true });
  if ((await lstat(base)).isSymbolicLink() || await realpath(base) !== base) {
    throw new Error('.collab-dev 不能是符号链接或 junction。');
  }
  const own = path.join(base, sessionKey(agent));
  await mkdir(own, { recursive: true });
  if ((await lstat(own)).isSymbolicLink() || await realpath(own) !== own) throw new Error('计划目录不安全。');
  return own;
}

export async function savePlan(agent, input) {
  requireMainSession(agent);
  const plan = validatePlan(input);
  const json = JSON.stringify(plan, null, 2) + '\n';
  if (Buffer.byteLength(json) > LIMIT) throw new Error('计划过大，请缩小任务范围。');
  const base = await planDirectory(agent), id = randomUUID();
  const staging = path.join(base, '.tmp-' + id), target = path.join(base, id);
  await mkdir(staging);
  try {
    const markdown = `# 协作开发计划\n\n${plan.goal}\n\n## 约束\n\n${plan.constraints.map(v => '- ' + v).join('\n') || '沿用项目现有约束。'}\n\n## 任务\n\n` +
      plan.tasks.map(t => `### ${t.id} ${t.subject}\n\n负责人：${t.assignee}；类型：${t.kind}；依赖：${t.dependencies.join(', ') || '无'}。\n\n${t.objective}\n\n验收：\n\n${t.acceptance.map(v => '- ' + v).join('\n')}\n\n修改范围：${t.inScope.join(', ') || '不授权修改产品代码'}。\n\n验证命令：${t.verify.join('；') || '按验收条目检查'}。`).join('\n\n');
    await writeFile(path.join(staging, 'plan.json'), json, { flag: 'wx' });
    await writeFile(path.join(staging, 'PLAN.md'), markdown + '\n', { flag: 'wx' });
    await writeFile(path.join(staging, 'ARCHITECTURE.md'), '# 架构与接口合同\n\n' + plan.architecture + '\n', { flag: 'wx' });
    await rename(staging, target);
    return { plan_id: id, directory: target, task_count: plan.tasks.length };
  } finally {
    // Only this call's randomly allocated staging directory is removed.
    if (path.dirname(staging) !== base) throw new Error('非法清理路径。');
    await rm(staging, { recursive: true, force: true });
  }
}

export async function loadPlan(agent, id) {
  if (!PLAN_ID.test(id)) throw new Error('无效的计划编号。');
  const directory = path.join(await planDirectory(agent), id);
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error('计划目录不安全。');
  const file = path.join(directory, 'plan.json');
  const info = await lstat(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('计划文件不能是符号链接或目录。');
  if (info.size > LIMIT) throw new Error('计划文件过大。');
  const raw = await readFile(file, 'utf8');
  if (Buffer.byteLength(raw) > LIMIT) throw new Error('计划文件过大。');
  return { directory, plan: validatePlan(JSON.parse(raw)) };
}
