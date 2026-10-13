// Summarize native evidence; delivery remains the native quality gate's decision.
export function summarizeStatus(snapshot) {
  if (snapshot?.profile?.name !== 'collab-dev' || !Array.isArray(snapshot.tasks)) {
    throw new Error('当前团队不是 collab-dev 开发计划，请在原生团队面板查看。');
  }
  const counts = { pending: 0, claimed: 0, in_progress: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const task of snapshot.tasks) {
    if (!Object.hasOwn(counts, task.status)) throw new Error(`未知任务状态：${task.status}`);
    counts[task.status]++;
  }
  const tests = snapshot.tasks.filter(task => ['verification', 'integration'].includes(task.kind))
    .map(({ id, subject, kind, status, output }) => ({ id, subject, kind, status, output: output ?? '' }));
  const delivery = snapshot.delivery;
  if (!delivery || typeof delivery.ok !== 'boolean' || !Array.isArray(delivery.blockers) || !Array.isArray(delivery.warnings)) {
    throw new Error('原生交付检查缺失，无法确认结果。');
  }
  return {
    team_id: snapshot.team_id, phase: snapshot.phase, halted: snapshot.halted === true,
    escalated: snapshot.escalated === true, total: snapshot.tasks.length, counts,
    deliverable: snapshot.phase !== 'staged' && !snapshot.halted && snapshot.deliverable === true && delivery.ok &&
      tests.some(task => task.kind === 'integration' && task.status === 'completed'),
    delivery, tests,
    members: (snapshot.members ?? []).map(({ name, status, activity, spawn_error }) => ({ name, status, activity, ...(spawn_error ? { error: spawn_error } : {}) })),
  };
}

export function renderStatus(summary) {
  const state = summary.halted ? '已停止' : summary.phase === 'staged' ? '等待批准'
    : summary.deliverable ? '可交付' : summary.escalated ? '需要处理' : '尚未通过交付检查';
  const labels = { pending: '待执行', claimed: '已领取', in_progress: '执行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
  return [
    `团队 ${summary.team_id}：${state}`,
    `任务：${summary.counts.completed}/${summary.total} 完成；${summary.counts.claimed + summary.counts.in_progress} 执行中；${summary.counts.failed} 条失败记录。`,
    ...summary.members.map(member => `${member.name}：${member.activity ?? member.status}${member.error ? ' — ' + member.error : ''}`),
    '验证与集成任务：',
    ...summary.tests.map(task => `${task.id} ${task.subject}：${labels[task.status]}${task.output ? '\n' + task.output : ''}`),
    ...summary.delivery.blockers.map(value => '交付阻塞：' + value),
    ...summary.delivery.warnings.map(value => '交付提示：' + value),
  ].join('\n');
}
