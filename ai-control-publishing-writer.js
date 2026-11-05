// PUBLISHING-AI-VIA-CONTROL-001 — 출판 AI 원고의 무료 AI 경유 창구.
//
// 출판 워커는 서비스 바인딩의 이름 있는 진입점(PublishingWriter)으로만 이 함수를 부른다.
// 공개 HTTP 경로가 없으므로 별도 비밀키가 필요 없고, 외부에서 호출할 수 없다.
// - 무료만: 유료(OpenAI·Anthropic)와 Workers AI는 쓰지 않는다(Workers AI는 출판이 공용 장부로 직접 쓴다).
// - 공정 배분: 출판 몫은 하루 호출 상한(dailyCallCap) 안에서만. 넘으면 다음 날로 미룬다.
// - 기록: 무료 제공자별 성공·실패와 남은 할당량은 기존 무료 할당량 장부에 그대로 남긴다.
import { invokeProviderWithMeta, providerCapabilities } from './ai-control-provider-router.js';
import { quotaCapabilities, recordFreeProviderOutcome } from './ai-free-quota.js';

export const PUBLISHING_WRITER_POLICY = Object.freeze({
  callerId: 'publishing',
  ledgerId: 'caller:publishing:free-text',
  dailyCallCap: 60,
  // 한국어 문장이 자연스러운 순서. 모두 0원 제공자만.
  providers: Object.freeze(['gemini-free', 'groq-free', 'openrouter-free', 'huggingface-free-credit']),
  paid: false,
});

const READY_FLAG = Object.freeze({
  'gemini-free': 'geminiFree',
  'groq-free': 'groqFree',
  'openrouter-free': 'openrouterFree',
  'huggingface-free-credit': 'huggingfaceFreeCredit',
});

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

export async function publishingWriterProviders(env = {}) {
  const caps = providerCapabilities(env, []);
  const ready = PUBLISHING_WRITER_POLICY.providers.filter(id => caps[READY_FLAG[id]] === true);
  let quotas = {};
  try { quotas = await quotaCapabilities(env, ready); } catch { quotas = {}; }
  return ready.filter(id => quotas?.[id]?.remaining !== 0);
}

async function reserveCall(env) {
  const db = env.DB; if (!db?.prepare) return false;
  const d = today(), t = new Date().toISOString(), id = PUBLISHING_WRITER_POLICY.ledgerId, cap = PUBLISHING_WRITER_POLICY.dailyCallCap;
  await db.prepare('INSERT OR IGNORE INTO ai_provider_daily_budget (provider_id, usage_date, call_count, updated_at) VALUES (?, ?, 0, ?)').bind(id, d, t).run();
  const r = await db.prepare('UPDATE ai_provider_daily_budget SET call_count = call_count + 1, updated_at = ? WHERE provider_id = ? AND usage_date = ? AND call_count + 1 <= ?')
    .bind(t, id, d, cap).run();
  return Number(r?.meta?.changes ?? r?.changes ?? 0) > 0;
}

/** One free text generation for the publishing factory. Never throws; never uses a paid provider. */
export async function writeForPublishing(env = {}, input = {}) {
  const system = clean(input?.system, 6000);
  const prompt = clean(input?.prompt, 16000);
  if (!prompt) return { ok: false, code: 'prompt_required' };
  let providers;
  try { providers = await publishingWriterProviders(env); } catch { providers = []; }
  if (!providers.length) return { ok: false, code: 'no_free_provider' };
  try { if (!(await reserveCall(env))) return { ok: false, code: 'daily_cap_reached' }; }
  catch { return { ok: false, code: 'ledger_unavailable' }; }
  const task = { id: crypto.randomUUID(), title: 'ekodi-publishing-ai-draft', origin: { provider: 'ekodi', channel: 'publishing-ai' } };
  const full = [system, prompt].filter(Boolean).join('\n\n');
  for (const providerId of providers) {
    try {
      const result = await invokeProviderWithMeta(env, providerId, full, task, 'publishing-writer');
      const text = clean(result?.text, 20000);
      if (!text) throw new Error('empty_model_answer');
      await recordFreeProviderOutcome(env, providerId, { ok: true, quota: result?.quota || null }).catch(() => {});
      return { ok: true, text, provider: providerId };
    } catch (error) {
      await recordFreeProviderOutcome(env, providerId, { ok: false, error }).catch(() => {});
      console.warn('publishing writer provider failed', providerId, clean(error?.message || error, 100));
    }
  }
  return { ok: false, code: 'all_free_providers_unavailable' };
}
