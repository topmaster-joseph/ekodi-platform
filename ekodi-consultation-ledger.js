import { buildEkodiConsultationReceipt } from './ai-consultation-governance.js';

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
}

function dbFrom(input) {
  const db = input?.DB || input;
  if (!db?.prepare) throw new Error('EKODI_COMMAND_LEDGER_DB_REQUIRED');
  return db;
}

function withReceiptEvidence(result, receipt) {
  const evidence = result?.evidence && typeof result.evidence === 'object' ? result.evidence : {};
  return Object.freeze({
    ...result,
    consultationReceipt: receipt,
    evidence: Object.freeze({
      ...evidence,
      consultation: Object.freeze({
        ...(evidence.consultation && typeof evidence.consultation === 'object' ? evidence.consultation : {}),
        status: receipt.execution.status,
        displayLabel: receipt.execution.displayLabel,
        actualCallCount: receipt.execution.actualCallCount,
        actualProviderCount: receipt.execution.actualProviderCount,
        detailPath: receipt.links.detail,
        receiptHash: receipt.hash,
      }),
    }),
  });
}

async function previousReceiptHash(db, taskId) {
  const row = await db.prepare('SELECT result_json FROM ai_command_runs WHERE task_id = ? ORDER BY id DESC LIMIT 1')
    .bind(text(taskId, 120)).first();
  const result = parseJson(row?.result_json, {});
  return text(result?.consultationReceipt?.hash, 128) || null;
}

export async function attachEkodiConsultationReceipt(input, task = {}, result = {}, options = {}) {
  const db = dbFrom(input);
  const previousHash = await previousReceiptHash(db, task.id || result.taskId);
  const receipt = await buildEkodiConsultationReceipt({
    task,
    result,
    attempt: Math.max(1, Number(task.attemptCount || options.attempt || 1)),
    createdAt: options.createdAt || new Date().toISOString(),
    previousHash,
  });
  return withReceiptEvidence(result, receipt);
}

export async function getEkodiConsultationHistory(input, taskId, options = {}) {
  const db = dbFrom(input);
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 50);
  const rows = await db.prepare('SELECT id, attempt, state, result_json, completed_at FROM ai_command_runs WHERE task_id = ? ORDER BY id DESC LIMIT ?')
    .bind(text(taskId, 120), limit).all();
  return Object.freeze((rows?.results || []).map(row => {
    const result = parseJson(row.result_json, {});
    const receipt = result?.consultationReceipt || null;
    return Object.freeze({
      runId: Number(row.id),
      attempt: Number(row.attempt || 0),
      state: text(row.state, 40),
      completedAt: row.completed_at || null,
      receipt: receipt ? Object.freeze({
        traceId: receipt.traceId || null,
        status: receipt.execution?.status || null,
        displayLabel: receipt.execution?.displayLabel || null,
        hash: receipt.hash || null,
        previousHash: receipt.previousHash || null,
      }) : null,
    });
  }));
}

export const EKODI_CONSULTATION_LEDGER = Object.freeze({
  version: '1.0.0',
  store: 'ai_command_tasks.result_json + ai_command_runs.result_json',
  hashChain: true,
  detailPath: '/api/control/ai/v8/tasks/{taskId}/consultation',
});
