import customerEntryWorker from './customer-entry-worker.js';
import { handleAdminSessionFastPath } from './admin-session-fastpath.js';
import { handleAgentMissionControl } from './ai-agent-control.js';
import { handleMessengerOperatorControl } from './messenger-operator-control.js';
import { handleMessengerOperatorPage } from './messenger-operator-page.js';
import { drainMessengerOutbox } from './messenger-outbox.js';
import { handleDeviceControl } from './device-control.js';
import { handleMarketingAdminControl } from './marketing-admin-control.js';
import { handleMarketingLedgerControl } from './marketing-ledger-control.js';
import { handleMarketingOrderConnectors } from './marketing-order-connectors.js';
import { handleAuthorBillingControl, runAuthorBillingSchedule } from './author-billing-control.js';
import { handleSystemHealthControl } from './system-health-control.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function errorResponse(message, code) {
  return applyApiSecurityHeaders(new Response(JSON.stringify({ error:message, code }), {status:500,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}));
}

async function handleSameOriginOperatorGoogleAuth(request, env, ctx) {
  if (request.method !== 'POST') return null;
  const url = new URL(request.url);
  if (!['/api/google/challenge','/api/google/login'].includes(url.pathname)) return null;
  if (String(request.headers.get('origin') || '') !== url.origin) return null;
  const headers = new Headers(request.headers);
  // Reuse the already-audited Google admin allowlist implementation. The bridge is
  // reachable only from this exact Control API origin, so no external origin gains access.
  headers.set('origin', 'https://admin.ekodi.kr');
  const body = await request.clone().arrayBuffer();
  const forwarded = new Request(url.toString(), { method:'POST', headers, body });
  return customerEntryWorker.fetch(forwarded, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;
    const path = new URL(request.url).pathname;

    if ((path === '/operator' || path === '/operator/' || path === '/operator.js') && request.method === 'GET') {
      const response = handleMessengerOperatorPage(request);
      if (response) return response;
    }

    const operatorGoogle = await handleSameOriginOperatorGoogleAuth(request, env, ctx);
    if (operatorGoogle) return applyApiSecurityHeaders(operatorGoogle);

    if (path === '/api/session' && request.method === 'GET') {
      try { const response = await handleAdminSessionFastPath(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Admin session fast path error', error); return errorResponse('관리자 세션 확인 중 오류가 발생했습니다.', 'ADMIN_SESSION_FASTPATH_ERROR'); }
    }

    if (path.startsWith('/api/author/billing/')) {
      try { const response = await handleAuthorBillingControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Author billing control error', error); return errorResponse('Creator AI 결제 처리 중 오류가 발생했습니다.', 'AUTHOR_BILLING_CONTROL_ERROR'); }
    }
    if (path.startsWith('/api/marketing/admin/')) {
      try { const response = await handleMarketingAdminControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Marketing AI admin control error', error); return errorResponse('Marketing AI 운영 API 처리 중 오류가 발생했습니다.', 'MARKETING_ADMIN_CONTROL_ERROR'); }
    }
    if (path.startsWith('/api/marketing/connectors/')) {
      try { const response = await handleMarketingOrderConnectors(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Marketing order connector error', error); return errorResponse('Marketing 주문·POS 연결 처리 중 오류가 발생했습니다.', 'MARKETING_ORDER_CONNECTOR_ERROR'); }
    }
    if (path.startsWith('/api/marketing/ledger/')) {
      try { const response = await handleMarketingLedgerControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Marketing ledger control error', error); return errorResponse('Marketing CRM 원장 처리 중 오류가 발생했습니다.', 'MARKETING_LEDGER_CONTROL_ERROR'); }
    }
    if (path === '/api/control/system-health') {
      try { const response = await handleSystemHealthControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('System Health control error', error); return errorResponse('System Health 처리 중 오류가 발생했습니다.', 'SYSTEM_HEALTH_CONTROL_ERROR'); }
    }
    if (path.startsWith('/api/control/messenger')) {
      try { const response = await handleMessengerOperatorControl(request, env, ctx); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Messenger Operator Control error', error); return errorResponse('EKODI Messenger 관리자 처리 중 오류가 발생했습니다.', 'MESSENGER_OPERATOR_CONTROL_ERROR'); }
    }
    if (path.startsWith('/api/control/devices') || path.startsWith('/api/device-agent')) {
      try { const response = await handleDeviceControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Device Control error', error); return errorResponse('Device Control 처리 중 오류가 발생했습니다.', 'DEVICE_CONTROL_ERROR'); }
    }
    if (path.startsWith('/api/control/ai/')) {
      try { const response = await handleAgentMissionControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('AI Mission Control error', error); return errorResponse('AI Mission Control 처리 중 오류가 발생했습니다.', 'AI_MISSION_CONTROL_ERROR'); }
    }

    const response = await customerEntryWorker.fetch(request, env, ctx);
    return applyApiSecurityHeaders(response);
  },

  async scheduled(controller, env, ctx) {
    const authorBilling = runAuthorBillingSchedule(env).catch(error => { console.error('Author billing schedule error', error); return { processed:0, error:'author_billing_schedule_failed' }; });
    const messengerOutbox = drainMessengerOutbox(env, { limit:20 }).catch(error => { console.error('Messenger outbox schedule error', error); return { processed:0, failed:1, error:'messenger_outbox_schedule_failed' }; });
    if (ctx?.waitUntil) { ctx.waitUntil(authorBilling); ctx.waitUntil(messengerOutbox); }
    if (typeof customerEntryWorker.scheduled === 'function') return customerEntryWorker.scheduled(controller, env, ctx);
    return Promise.all([authorBilling, messengerOutbox]);
  },
};
