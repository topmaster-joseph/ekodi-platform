// CHURCH-NAVER-EXCEPTION-001
// One guarded change to an existing Cloudflare Single Redirect. Preserve
// the exact redirect action/target, all other rules, customer domains and DNS.
import { pathToFileURL } from 'node:url';

export const DOMAIN = 'ekodichurch.kr';
export const RULE_NAME = 'EKODI Church canonical path redirect';
export const NAVER_FILE_PATH = '/naver85321326d5553a0caa3a944158fc2969.html';
export const EXCLUSION = '(http.request.uri.path ne "' + NAVER_FILE_PATH + '")';
export const PHASE = 'http_request_dynamic_redirect';
const ACCOUNT = '6986fd633f4e33bf804c921697b2d797';

export function findChurchRule(ruleset) {
  if (!ruleset || !Array.isArray(ruleset.rules) || ruleset.phase !== PHASE) {
    throw new Error('Unexpected redirect ruleset; no mutation');
  }
  const matches = ruleset.rules.filter(rule => rule.description === RULE_NAME);
  if (matches.length !== 1) throw new Error('Expected exactly one EKODI church redirect; no mutation');
  const [rule] = matches;
  if (!rule.id || rule.action !== 'redirect' || rule.enabled !== true) {
    throw new Error('Target church rule must be an enabled Single Redirect');
  }
  const parameters = JSON.stringify(rule.action_parameters || {});
  if (!parameters.includes('ekodi.kr') || !parameters.includes('ekodichurch')) {
    throw new Error('Church redirect target changed; refusing unrelated edits');
  }
  if (typeof rule.expression !== 'string' || !rule.expression.trim()) {
    throw new Error('Missing original redirect expression');
  }
  return rule;
}

export function planChurchNaverExclusion(rule) {
  if (rule.expression.includes(EXCLUSION)) return { changed: false, expression: rule.expression };
  if (rule.expression.includes(NAVER_FILE_PATH)) {
    throw new Error('Existing special handling for the Naver path must be inspected manually');
  }
  // Retain the old expression and precedence exactly. Only one equality
  // exception is appended. All other URLs still match as before.
  return { changed: true, expression: '(' + rule.expression + ') and ' + EXCLUSION };
}

export function patchBody(rule, expression) {
  const payload = {
    action: 'redirect',
    expression,
    description: rule.description,
    enabled: rule.enabled,
    action_parameters: rule.action_parameters,
  };
  if (typeof rule.ref === 'string') payload.ref = rule.ref;
  if (rule.logging !== undefined) payload.logging = rule.logging;
  return payload;
}

export function assertOtherRulesUnchanged(before, after, targetId) {
  if (before.rules.length !== after.rules.length) throw new Error('Ruleset length changed unexpectedly');
  for (let i = 0; i < before.rules.length; i++) {
    const a = before.rules[i], b = after.rules[i];
    if (!a || !b || a.id !== b.id) throw new Error('Rule order or IDs changed unexpectedly');
    if (a.id === targetId) {
      if (JSON.stringify(a.action_parameters) !== JSON.stringify(b.action_parameters)
        || a.action !== b.action || a.enabled !== b.enabled || a.description !== b.description) {
        throw new Error('Church redirect action or target was modified');
      }
    } else {
      const fields = ['expression','action','action_parameters','description','enabled','ref'];
      for (const k of fields) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        throw new Error('Unrelated rule modified: ' + a.id + ' / ' + k);
      }
    }
  }
}

async function api(token, endpoint, method = 'GET', payload) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + endpoint, {
    method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Cloudflare returned non-JSON status ' + res.status); }
  if (!res.ok || data?.success !== true) {
    const codes = (data?.errors || []).map(e => String(e.code || '') + ':' + String(e.message || '').slice(0, 160));
    throw new Error('Cloudflare API HTTP ' + res.status + ' ' + codes.join('; '));
  }
  return data.result;
}

export async function reconcileChurchNaverRedirect({ token, accountId, mode = 'apply', request = api }) {
  if (!token || accountId !== ACCOUNT) throw new Error('EKODI Production Cloudflare account/token guard failed');
  const zones = await request(token, '/zones?name=' + DOMAIN + '&account.id=' + accountId);
  if (!Array.isArray(zones) || zones.length !== 1 || zones[0].name !== DOMAIN || zones[0].status !== 'active') {
    throw new Error('Church zone missing or ambiguous; no changes');
  }
  const zoneId = zones[0].id;
  if (!/^[0-9a-f]{32}$/i.test(zoneId)) throw new Error('Unexpected zone ID');
  const entry = '/zones/' + zoneId + '/rulesets/phases/' + PHASE + '/entrypoint';
  const before = await request(token, entry);
  if (!before?.id || before.phase !== PHASE) throw new Error('Missing zone-level redirect entrypoint');
  const rule = findChurchRule(before);
  const plan = planChurchNaverExclusion(rule);
  if (mode === 'inspect') {
    return { zone: DOMAIN, targetRule: rule.id, originalExpression: rule.expression,
      plannedExpression: plan.expression, actionParameters: rule.action_parameters, changed: plan.changed };
  }
  if (mode !== 'apply') throw new Error('Unexpected mode');
  if (!plan.changed) {
    return { zone: DOMAIN, outcome: 'already_excluded', ruleId: rule.id };
  }
  // Surgical PATCH one rule. Never PUT the whole ruleset or edit DNS/Pages.
  const patch = patchBody(rule, plan.expression);
  const updated = await request(token, '/zones/' + zoneId + '/rulesets/' + before.id + '/rules/' + rule.id,
    'PATCH', patch);
  assertOtherRulesUnchanged(before, updated, rule.id);
  const fresh = await request(token, entry);
  assertOtherRulesUnchanged(before, fresh, rule.id);
  const actual = fresh.rules.find(r => r.id === rule.id);
  if (!actual || actual.expression !== plan.expression) throw new Error('Redirect exception failed verification');
  return { zone: DOMAIN, outcome: 'updated', ruleId: rule.id, originalExpression: rule.expression, plannedExpression: plan.expression };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = process.argv.includes('--inspect') ? 'inspect' : 'apply';
    if (!process.env.CLOUDFLARE_CHURCH_RULES_API_TOKEN) {
      throw new Error('Missing CLOUDFLARE_CHURCH_RULES_API_TOKEN: create a zone-scoped token with Zone Read and Single Redirect Edit for ekodichurch.kr; add it as a GitHub Actions secret');
    }
    const result = await reconcileChurchNaverRedirect({
      token: process.env.CLOUDFLARE_CHURCH_RULES_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      mode,
    });
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error('Guarded Church Naver redirect exception failed: ' + error.message);
    process.exitCode = 1;
  }
}
