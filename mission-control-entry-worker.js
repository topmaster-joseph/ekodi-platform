import customerEntryWorker from './customer-entry-worker.js';
import { handleAdminSessionFastPath } from './admin-session-fastpath.js';
import { handleAgentMissionControl } from './ai-agent-control.js';
import { handleUserAiControl } from './user-ai-control.js';
import { applyUserAiPlanOverrides, handleUserAiAdminControl } from './user-ai-admin-control.js';
import { AI_ACCESS_POLICY } from './ai-access-orchestration.js';
import { PERSONAL_AI_PROVIDER_REGISTRY } from './personal-ai-provider-registry.js';
import { handleMessengerOperatorControl } from './messenger-operator-control.js';
import { handleMessengerOperatorPage } from './messenger-operator-page.js';
import { drainMessengerOutbox } from './messenger-outbox.js';
import { handleDeviceControl } from './device-control.js';
import { claimHybridFallback, handleHybridAgentResult, handleHybridExecution } from './hybrid-execution.js';
import { handleHybridExecutionMonitor, runHybridExecutionMonitor } from './hybrid-execution-monitor.js';
import { handleMarketingAdminControl } from './marketing-admin-control.js';
import { handleMarketingLedgerControl } from './marketing-ledger-control.js';
import { handleMarketingOrderConnectors } from './marketing-order-connectors.js';
import { handleAuthorBillingControl, runAuthorBillingSchedule } from './author-billing-control.js';
import { handleSystemHealthControl } from './system-health-control.js';
import { handleApiCostControl } from './api-cost-control.js';
import { handleCloudflareSecretControl } from './cloudflare-secret-control.js';
import { handleBooksNetworkRequest } from './books-network-control.js';
import { handleUniversalMembership } from './universal-membership.js';
import { handleHomepagePresentation } from './homepage-presentation-control.js';
import { handleStorageGateway } from './storage-gateway.js';
import { handleExternalAiModuleGateway } from './external-ai-module-gateway.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function errorResponse(message, code) {
  return applyApiSecurityHeaders(new Response(JSON.stringify({ error:message, code }), {
    status:500,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},
  }));
}

function userAiResponse(response) {
  if (!response) return response;
  response.headers.set('x-ekodi-ai-access-policy', AI_ACCESS_POLICY.version);
  response.headers.set('x-ekodi-personal-ai-registry', PERSONAL_AI_PROVIDER_REGISTRY.version);
  return applyApiSecurityHeaders(response);
}

function allowedControlOrigin(request, env = {}) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return '';
  const allowed = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : '';
}

function handleCloudflareSecretPreflight(request, env = {}) {
  if (request.method !== 'OPTIONS') return null;
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/control/secrets')) return null;
  const origin = allowedControlOrigin(request, env);
  if (!origin) {
    return applyApiSecurityHeaders(new Response(JSON.stringify({ error:'허용되지 않은 Origin입니다.', code:'ORIGIN_FORBIDDEN' }), {
      status:403,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'},
    }));
  }
  const headers = new Headers({
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-allow-headers':'authorization, content-type, x-ekodi-confirm-impact',
    'access-control-max-age':'86400',
    'cache-control':'no-store',
    'vary':'Origin',
  });
  return applyApiSecurityHeaders(new Response(null, { status:204, headers }));
}

export default {
  async fetch(request, env, ctx) {
    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;

    const secretPreflight = handleCloudflareSecretPreflight(request, env);
    if (secretPreflight) return secretPreflight;

    const path = new URL(request.url).pathname;

    if (path.startsWith('/api/storage/v1')) {
      try { const response = await handleStorageGateway(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Storage Gateway error', error); return errorResponse('EKODI Storage Gateway 처리 중 오류가 발생했습니다.', 'STORAGE_GATEWAY_ERROR'); }
    }

    if (path.startsWith('/api/ai-modules/v1')) {
      try { const response = await handleExternalAiModuleGateway(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('External AI Module Gateway error', error); return errorResponse('EKODI AI Module Gateway 처리 중 오류가 발생했습니다.', 'AI_MODULE_GATEWAY_ERROR'); }
    }

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

    if (path === '/api/homepage/presentation' || path === '/api/control/homepage') {
      try { const response = await handleHomepagePresentation(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Homepage presentation control error', error); return errorResponse('EKODI 첫화면 표시 설정 처리 중 오류가 발생했습니다.', 'HOMEPAGE_PRESENTATION_ERROR'); }
    }

    if (path.startsWith('/api/user-ai/')) {
      try {
        const runtimeEnv = await applyUserAiPlanOverrides(env);
        const response = await handleUserAiControl(request, runtimeEnv);
        if (response) return userAiResponse(response);
      }
      catch (error) { console.error('User AI control error', error); return errorResponse('개인 AI 연결 처리 중 오류가 발생했습니다.', 'USER_AI_CONTROL_ERROR'); }
    }

    if (path.startsWith('/api/membership/')) {
      try { const response = await handleUniversalMembership(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Universal membership error', error); return errorResponse('통합 회원등급·구독 처리 중 오류가 발생했습니다.', 'UNIVERSAL_MEMBERSHIP_ERROR'); }
    }

    if (path.startsWith('/api/books/public/stores') || path.startsWith('/api/books/me') || path.startsWith('/api/books/admin/network')) {
      try { const response = await handleBooksNetworkRequest(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Books Network control error', error); return errorResponse('출판·서점 네트워크 처리 중 오류가 발생했습니다.', 'BOOKS_NETWORK_ERROR'); }
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

    if (path.startsWith('/api/control/secrets')) {
      try { const response = await handleCloudflareSecretControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Cloudflare secret control error', error); return errorResponse('Cloudflare Secret 처리 중 오류가 발생했습니다.', 'CLOUDFLARE_SECRET_CONTROL_ERROR'); }
    }

    if (path.startsWith('/api/control/system-health')) {
      try { const response = await handleSystemHealthControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('System Health control error', error); return errorResponse('System Health 처리 중 오류가 발생했습니다.', 'SYSTEM_HEALTH_CONTROL_ERROR'); }
    }

    if (path === '/api/control/api-cost') {
      try { const response = await handleApiCostControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('API cost control error', error); return errorResponse('API 비용 관리 처리 중 오류가 발생했습니다.', 'API_COST_CONTROL_ERROR'); }
    }

    if (path.startsWith('/api/control/user-ai')) {
      try { const response = await handleUserAiAdminControl(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('User AI admin control error', error); return errorResponse('User AI 운영 처리 중 오류가 발생했습니다.', 'USER_AI_ADMIN_CONTROL_ERROR'); }
    }

    if (path.startsWith('/api/control/messenger')) {
      try { const response = await handleMessengerOperatorControl(request, env, ctx); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Messenger Operator Control error', error); return errorResponse('EKODI Messenger 관리자 처리 중 오류가 발생했습니다.', 'MESSENGER_OPERATOR_CONTROL_ERROR'); }
    }

    if (path === '/api/control/hybrid-execution/monitor') {
      try { const response = await handleHybridExecutionMonitor(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Hybrid Execution monitor error', error); return errorResponse('하이브리드 실행망 감시 처리 중 오류가 발생했습니다.', 'HYBRID_EXECUTION_MONITOR_ERROR'); }
    }

    if (path.startsWith('/api/control/hybrid-execution')) {
      try { const response = await handleHybridExecution(request, env); if (response) return applyApiSecurityHeaders(response); }
      catch (error) { console.error('Hybrid Execution error', error); return errorResponse('하이브리드 실행망 처리 중 오류가 발생했습니다.', 'HYBRID_EXECUTION_ERROR'); }
    }

    const hybridResultMatch = path.match(/^\/api\/device-agent\/commands\/(hyb_[^/]+)\/result$/);
    if (request.method === 'POST' && hybridResultMatch) {
      try {
        const response = await handleHybridAgentResult(request, env, decodeURIComponent(hybridResultMatch[1]));
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Hybrid Execution result error', error);
        return errorResponse('하이브리드 실행 결과 처리 중 오류가 발생했습니다.', 'HYBRID_EXECUTION_RESULT_ERROR');
      }
    }

    if (path.startsWith('/api/control/devices') || path.startsWith('/api/device-agent')) {
      try {
        const response = await handleDeviceControl(request, env);
        if (response && request.method === 'GET' && path === '/api/device-agent/commands/next' && response.ok) {
          const body = await response.clone().json().catch(() => null);
          if (!body?.command) {
            const hybrid = await claimHybridFallback(request, env);
            if (hybrid) return applyApiSecurityHeaders(hybrid);
          }
        }
        if (response) return applyApiSecurityHeaders(response);
      }
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
    const hybridWatchdog = runHybridExecutionMonitor(env).catch(error => { console.error('Hybrid execution watchdog schedule error', error); return { status:'unavailable', error:'hybrid_execution_watchdog_failed' }; });
    if (ctx?.waitUntil) { ctx.waitUntil(authorBilling); ctx.waitUntil(messengerOutbox); ctx.waitUntil(hybridWatchdog); }
    if (typeof customerEntryWorker.scheduled === 'function') return customerEntryWorker.scheduled(controller, env, ctx);
    return Promise.all([authorBilling, messengerOutbox, hybridWatchdog]);
  },
};

async function handleSameOriginOperatorGoogleAuth(request, env, ctx) {
  if (request.method !== 'POST') return null;
  const url = new URL(request.url);
  if (!['/api/google/challenge','/api/google/login'].includes(url.pathname)) return null;
  if (String(request.headers.get('origin') || '') !== url.origin) return null;
  const headers = new Headers(request.headers);
  headers.set('origin', 'https://admin.ekodi.kr');
  const body = await request.clone().arrayBuffer();
  const forwarded = new Request(url.toString(), { method:'POST', headers, body });
  return customerEntryWorker.fetch(forwarded, env, ctx);
}