/**
 * R1 API client for frontend — wraps /api/v1/r1 endpoints
 * Covers E2-S2 through E9
 */

const BASE = '/api/v1/r1';

async function request(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      // Use local key if available (frontend local mode)
      Authorization: `Bearer ${localStorage.getItem('nexus-api-key') ?? 'local'}`,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? json.message ?? `Request failed ${res.status}`);
  return json.data ?? json;
}

export const r1 = {
  // Projects
  async inspectProject(projectId: string) {
    return request(`/projects/${projectId}`);
  },
  async listProjects() {
    // fallback: use old API if available
    try {
      const res = await fetch('/api/v1/projects', { headers: { Authorization: `Bearer ${localStorage.getItem('nexus-api-key') ?? 'local'}` } });
      const j = await res.json();
      return j.data?.items ?? j.items ?? [];
    } catch { return []; }
  },
  async createProject(project: { id: string; name: string; mode: 'local' | 'shared'; scope?: Record<string, string>; idempotencyKey?: string }) {
    return request('/projects', { method: 'POST', body: JSON.stringify({ ...project, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) });
  },

  // Tasks
  async listTasks(projectId: string) {
    return request(`/projects/${projectId}/tasks`).then((r) => r.tasks ?? r);
  },
  async getTask(projectId: string, taskId: string) {
    return request(`/projects/${projectId}/tasks/${taskId}`);
  },
  async createTask(projectId: string, task: any) {
    return request(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(task) });
  },
  async listTaskEvents(projectId: string, taskId: string) {
    return request(`/projects/${projectId}/tasks/${taskId}/events`).then((r) => r.events ?? r);
  },
  async claimTask(projectId: string) {
    return request(`/projects/${projectId}/tasks/claim`, { method: 'POST', body: JSON.stringify({}) });
  },
  async cancelTask(projectId: string, taskId: string) {
    return request(`/projects/${projectId}/tasks/${taskId}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  },
  async retryTask(projectId: string, taskId: string) {
    return request(`/projects/${projectId}/tasks/${taskId}/retry`, { method: 'POST', body: JSON.stringify({}) });
  },
  async getRecovery(projectId: string, taskId: string) {
    return request(`/projects/${projectId}/tasks/${taskId}/recovery`);
  },
  async checkpoint(projectId: string, taskId: string, stepId: string, snapshot: Record<string, unknown>) {
    return request(`/projects/${projectId}/tasks/${taskId}/checkpoints`, { method: 'POST', body: JSON.stringify({ stepId, snapshot }) });
  },

  // Recall
  async recall(projectId: string, query: string, tokenBudget = 1500, mode: 'lexical' | 'vector' | 'hybrid' = 'lexical') {
    return request(`/projects/${projectId}/recall`, { method: 'POST', body: JSON.stringify({ query, tokenBudget, mode, includeExplanation: true }) });
  },
  async feedback(projectId: string, resultId: string, query: string, helpful: boolean) {
    return request(`/projects/${projectId}/recall/feedback`, { method: 'POST', body: JSON.stringify({ resultId, query, helpful }) });
  },
  async listFeedback(projectId: string, resultId?: string) {
    const q = resultId ? `?resultId=${encodeURIComponent(resultId)}` : '';
    return request(`/projects/${projectId}/recall/feedback${q}`).then((r) => r.feedback ?? r);
  },
  async contradictions(projectId: string) {
    return request(`/projects/${projectId}/contradictions`).then((r) => r.contradictions ?? r);
  },

  // Approvals
  async listApprovals(projectId: string) {
    return request(`/projects/${projectId}/approvals`).then((r) => r.approvals ?? r);
  },
  async requestApproval(projectId: string, input: any) {
    return request(`/projects/${projectId}/approvals`, { method: 'POST', body: JSON.stringify(input) });
  },
  async decideApproval(projectId: string, approvalId: string, decision: 'approved' | 'denied', actionHash: string, policyVersion: string) {
    return request(`/projects/${projectId}/approvals/${approvalId}/decide`, { method: 'POST', body: JSON.stringify({ decision, actionHash, policyVersion }) });
  },

  // Tools
  async readFile(projectId: string, path: string, taskId?: string) {
    return request(`/projects/${projectId}/tool/read`, { method: 'POST', body: JSON.stringify({ path, taskId }) });
  },
  async writeFile(projectId: string, path: string, content: string, taskId: string, approvalId: string) {
    return request(`/projects/${projectId}/tool/write`, { method: 'POST', body: JSON.stringify({ path, content, taskId, approvalId }) });
  },
  async exec(projectId: string, command: string, args: string[], taskId: string, approvalId: string) {
    return request(`/projects/${projectId}/tool/exec`, { method: 'POST', body: JSON.stringify({ command, args, taskId, approvalId }) });
  },

  // Kill switch
  async killSwitchStatus(projectId?: string) {
    return projectId ? request(`/projects/${projectId}/kill-switch/status`) : request('/kill-switch/status');
  },
  async enableKillSwitch(reason: string, projectId?: string) {
    return projectId ? request(`/projects/${projectId}/kill-switch/enable`, { method: 'POST', body: JSON.stringify({ reason }) }) : request('/kill-switch/enable', { method: 'POST', body: JSON.stringify({ reason }) });
  },
  async disableKillSwitch(reason: string, projectId?: string) {
    return projectId ? request(`/projects/${projectId}/kill-switch/disable`, { method: 'POST', body: JSON.stringify({ reason }) }) : request('/kill-switch/disable', { method: 'POST', body: JSON.stringify({ reason }) });
  },

  // Evidence
  async evidenceTimeline(projectId: string, taskId?: string) {
    const q = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
    return request(`/projects/${projectId}/evidence/timeline${q}`).then((r) => r.timeline ?? r);
  },
  async evidenceExport(projectId: string, taskIds?: string[]) {
    const q = taskIds?.length ? `?taskIds=${encodeURIComponent(taskIds.join(','))}` : '';
    return request(`/projects/${projectId}/evidence/export${q}`);
  },

  // Telemetry
  async telemetry(projectId: string) {
    return request(`/projects/${projectId}/telemetry`);
  },

  // Serena
  async codeIndex(projectId: string, root?: string) {
    return request(`/projects/${projectId}/code/index`, { method: 'POST', body: JSON.stringify({ root }) });
  },
  async codeMap(projectId: string) {
    return request(`/projects/${projectId}/code/map`);
  },
  async findSymbols(projectId: string, query: string, limit = 50) {
    return request(`/projects/${projectId}/code/find-symbols`, { method: 'POST', body: JSON.stringify({ query, limit }) }).then((r) => r.symbols ?? r);
  },
  async semanticSearch(projectId: string, query: string, limit = 20) {
    return request(`/projects/${projectId}/code/semantic-search`, { method: 'POST', body: JSON.stringify({ query, limit }) }).then((r) => r.results ?? r);
  },
  async diagnostics(projectId: string) {
    return request(`/projects/${projectId}/code/diagnostics`).then((r) => r.diagnostics ?? r);
  },
};
