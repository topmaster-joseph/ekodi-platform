// EKODI-MALL-OWNERCLAN-001: 오너클랜 셀러 API(GraphQL) 연결 준비.
// 근거(2026-10-26 확인): 오너클랜 API센터 요약 문서 — 인증 POST https://auth.ownerclan.com/auth
//   {service:"ownerclan", userType:"seller", username, password} → JWT(1개월), 요청 헤더 Authorization: Bearer.
//   GraphQL https://api.ownerclan.com/v1/graphql (Sandbox: api-sandbox / auth-sandbox).
//   상품: item / allItems / itemsByKeys / itemHistories, 주문: createOrder / simulateCreateOrder / cancelOrder 등.
// 1단계(현재): 6시간마다 로그인 + 스키마 확인(필드·인자 이름만 기록, 토큰·비밀번호 미기록).
//   스키마가 확인되면 도매꾹과 같은 방식(선별 → 승인 게이트 → 자동발주)으로 연결한다.
import { raiseAlert } from './ops-alerts.js';

const isoNow = () => new Date().toISOString();
const PROBE_MS = 6 * 60 * 60 * 1000;

export function ownerclanHosts(env) {
  const sandbox = String(env?.OWNERCLAN_ENV || '').toLowerCase() === 'sandbox';
  return sandbox
    ? { auth: 'https://auth-sandbox.ownerclan.com/auth', graphql: 'https://api-sandbox.ownerclan.com/v1/graphql', mode: 'sandbox' }
    : { auth: 'https://auth.ownerclan.com/auth', graphql: 'https://api.ownerclan.com/v1/graphql', mode: 'production' };
}

export function ownerclanConfigured(env) {
  return Boolean(env?.OWNERCLAN_USER_ID && env?.OWNERCLAN_PASSWORD);
}

function redact(text, env) {
  let out = String(text || '');
  if (env?.OWNERCLAN_PASSWORD) out = out.split(String(env.OWNERCLAN_PASSWORD)).join('***');
  return out.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***').slice(0, 300);
}

export async function ownerclanToken(env, fetchImpl = fetch) {
  const hosts = ownerclanHosts(env);
  const res = await fetchImpl(hosts.auth, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ service: 'ownerclan', userType: 'seller', username: env.OWNERCLAN_USER_ID, password: env.OWNERCLAN_PASSWORD })
  });
  const text = await res.text();
  let token = '';
  try { const j = JSON.parse(text); token = j.token || j.accessToken || j.data?.token || ''; } catch { if (/^eyJ/.test(text.trim())) token = text.trim(); }
  if (!res.ok || !token) throw new Error(`오너클랜 로그인 실패(${res.status}) ${redact(text, env)}`);
  return token;
}

export async function ownerclanQuery(env, token, query, variables = {}, fetchImpl = fetch) {
  const res = await fetchImpl(ownerclanHosts(env).graphql, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`오너클랜 API 응답 오류(${res.status})`);
  if (body.errors?.length) throw new Error(`오너클랜: ${redact(body.errors[0]?.message || JSON.stringify(body.errors[0]), env)}`);
  return body.data;
}

const SCHEMA_QUERY = `query { __schema { queryType { fields { name args { name } } } mutationType { fields { name args { name } } } } }`;

/** 로그인 + 스키마 확인. 결과는 supplier_connector_checks(probe:ownerclan)에 필드 이름만 남긴다. */
export async function probeOwnerclan(env, fetchImpl = fetch) {
  if (!env?.DB || !ownerclanConfigured(env)) return { skipped: 'not-configured' };
  const last = await env.DB.prepare("SELECT checked_at FROM supplier_connector_checks WHERE external_ref='probe:ownerclan' ORDER BY checked_at DESC LIMIT 1").first().catch(() => null);
  if (last && Date.now() - Date.parse(last.checked_at) < PROBE_MS) return { skipped: 'recent' };
  const hosts = ownerclanHosts(env);
  let ok = false; let meta = { mode: hosts.mode };
  try {
    const token = await ownerclanToken(env, fetchImpl);
    meta.login = 'ok';
    try {
      const data = await ownerclanQuery(env, token, SCHEMA_QUERY, {}, fetchImpl);
      const pick = (t) => (t?.fields || []).map((f) => `${f.name}(${(f.args || []).map((a) => a.name).join(',')})`);
      meta.queries = pick(data?.__schema?.queryType).slice(0, 40);
      meta.mutations = pick(data?.__schema?.mutationType).slice(0, 40);
    } catch (error) { meta.schema = redact(error.message, env); }
    ok = true;
    await env.DB.prepare("UPDATE mall_ops_alerts SET status='resolved',resolved_at=?,updated_at=? WHERE status='open' AND kind='supply.ownerclan_login_failed'").bind(isoNow(), isoNow()).run().catch(() => {});
  } catch (error) {
    meta.login = 'failed'; meta.error = redact(error.message, env);
    await raiseAlert(env, { severity: 'warn', kind: 'supply.ownerclan_login_failed', message: meta.error });
  }
  await env.DB.prepare('INSERT INTO supplier_connector_checks (id,provider_id,check_type,external_ref,result_status,metadata_json,checked_at) VALUES (?,?,?,?,?,?,?)')
    .bind(`chk_${crypto.randomUUID().replaceAll('-', '')}`, 'ownerclan-official', 'readiness', 'probe:ownerclan', ok ? 'ok' : 'failed', JSON.stringify(meta).slice(0, 3000), isoNow()).run().catch(() => {});
  return { ok, ...meta };
}
