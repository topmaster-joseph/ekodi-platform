import { getControlPlaneSummary } from './cognitive-control-plane.js';

export const AI_CONTROL_POLICY = Object.freeze({
  version: '0.3.0',
  defaultMode: 'primary-review',
  modes: Object.freeze(['single', 'primary-review', 'parallel']),
  providerOrder: Object.freeze([
    'gemini-free',
    'node:codex',
    'node:gemini-cli',
    'node:claude-code',
    'openai-api',
    'anthropic-api',
    'worker:claude',
    'worker:chatgpt',
    'worker:gemini',
    'worker:notebooklm',
    'worker:aistudio',
  ]),
  maxPromptLength: 24000,
  maxParallelProviders: 3,
  executionEnvironment: 'development',
  controlPlane: getControlPlaneSummary(),
});

const clean = value => String(value ?? '').trim();
const unique = values => [...new Set(values.filter(Boolean))];

export function createTaskId(now = new Date(), random = Math.random) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(random() * 0xffffff).toString(36).padStart(4, '0').slice(0, 4);
  return `task-${stamp}-${suffix}`;
}

export function normalizeTaskInput(input = {}) {
  const prompt = clean(input.prompt);
  if (!prompt) throw new Error('prompt_required');
  if (prompt.length > AI_CONTROL_POLICY.maxPromptLength) throw new Error('prompt_too_long');
  const mode = clean(input.mode).toLowerCase() || AI_CONTROL_POLICY.defaultMode;
  if (!AI_CONTROL_POLICY.modes.includes(mode)) throw new Error('invalid_mode');
  const title = clean(input.title).slice(0, 160) || prompt.replace(/\s+/g, ' ').slice(0, 80);
  const requestedProviders = unique(Array.isArray(input.providers) ? input.providers.map(clean) : []);
  const needsCodeBranch = input.needsCodeBranch === true || /\b(code|coding|git|github|branch|deploy|worker|repository|repo)\b/i.test(prompt) || /코드|코딩|깃|브랜치|배포|저장소/.test(prompt);
  return Object.freeze({
    title,
    prompt,
    mode,
    requestedProviders,
    needsCodeBranch,
    executionEnvironment: AI_CONTROL_POLICY.executionEnvironment,
  });
}

export function availableProviderIds(capabilities = {}) {
  const ids = [];
  if (capabilities.geminiFree) ids.push('gemini-free');
  for (const id of capabilities.nodeProviders || []) ids.push(`node:${clean(id).toLowerCase()}`);
  if (capabilities.openaiApi) ids.push('openai-api');
  if (capabilities.anthropicApi) ids.push('anthropic-api');
  for (const id of capabilities.workerProviders || []) ids.push(`worker:${clean(id).toLowerCase()}`);
  return unique(ids);
}

export function buildExecutionPlan(task, capabilities = {}) {
  const available = availableProviderIds(capabilities);
  const requested = task.requestedProviders.length ? task.requestedProviders.filter(id => available.includes(id)) : [];
  const ordered = requested.length ? requested : AI_CONTROL_POLICY.providerOrder.filter(id => available.includes(id));
  if (!ordered.length) return Object.freeze([]);
  if (task.mode === 'single') return Object.freeze([{ providerId: ordered[0], role: 'primary' }]);
  if (task.mode === 'primary-review') {
    const plan = [{ providerId: ordered[0], role: 'primary' }];
    if (ordered[1]) plan.push({ providerId: ordered[1], role: 'reviewer' });
    return Object.freeze(plan);
  }
  return Object.freeze(ordered.slice(0, AI_CONTROL_POLICY.maxParallelProviders).map((providerId, index) => ({providerId, role: index === 0 ? 'primary' : `parallel-${index + 1}`})));
}

export function rolePrompt(task, role, context = {}) {
  const branch = clean(context.branch);
  return [
    `EKODI task: ${task.title}`,
    `Role: ${role}`,
    `Execution environment: ${task.executionEnvironment || AI_CONTROL_POLICY.executionEnvironment}`,
    branch ? `Isolated branch: ${branch}` : 'No source branch has been allocated for this task.',
    'Respect least privilege and the central review, merge, and deployment gate.',
    'Never mutate production directly. Production changes must promote the same verified immutable artifact through Governance Plane.',
    role === 'reviewer' ? 'Review independently and identify risks, missing tests, conflicts, and simpler alternatives.' : '',
    '',
    task.prompt,
  ].filter(Boolean).join('\n');
}

export function summarizeRuns(runs = []) {
  const successful = runs.filter(run => run.ok);
  const failed = runs.filter(run => !run.ok);
  return Object.freeze({total:runs.length,successful:successful.length,failed:failed.length,providers:runs.map(run=>run.providerId),needsHumanApproval:successful.length>0});
}
