// EKODI common Workers AI runner.
//
// Every direct Workers AI call in feature modules goes through runWorkersAi so
// that (1) the provider can be swapped in one place (portability), (2) calls are
// visible in the shared routing ledger `ai_provider_routing_events` that the
// Eval Lab scorecard reads (collaboration/evaluability), and (3) feature code
// keeps its own fallbacks unchanged (compatibility).
//
// Ledger writes are best-effort and never awaited on the hot path, so realtime
// callers (live interpretation) gain no latency. Workers without the central
// ledger table simply skip recording.

export const WORKERS_AI_PROVIDER = 'cloudflare-workers-ai';

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

function ledgerDb(env) {
  return env?.DB?.prepare ? env.DB : null;
}

export function recordWorkersAiEvent(env, { capability, eventType, reason = '', waitUntil } = {}) {
  const db = ledgerDb(env);
  if (!db) return null;
  const write = db
    .prepare('INSERT INTO ai_provider_routing_events (id,capability,provider_id,event_type,reason,position,previous_provider,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), clip(capability, 40) || 'default', WORKERS_AI_PROVIDER, clip(eventType, 40), clip(reason, 160), 0, '', new Date().toISOString())
    .run()
    .catch(() => {});
  if (typeof waitUntil === 'function') {
    try { waitUntil(write); } catch { /* best effort */ }
  }
  return write;
}

// sampleRate applies to successes only; failures are always recorded.
export async function runWorkersAi(env, model, input, { capability = 'default', module = 'unknown', sampleRate = 1, waitUntil, random = Math.random } = {}) {
  if (!env?.AI?.run) throw new Error('workers_ai_binding_unavailable');
  const reason = `${clip(module, 60)}:${clip(model, 90)}`;
  try {
    const result = await env.AI.run(model, input);
    if (sampleRate >= 1 || random() < sampleRate) recordWorkersAiEvent(env, { capability, eventType: 'selected', reason, waitUntil });
    return result;
  } catch (error) {
    recordWorkersAiEvent(env, { capability, eventType: 'attempt-failed', reason: `${reason}:${clip(error?.message || error, 60)}`, waitUntil });
    throw error;
  }
}
