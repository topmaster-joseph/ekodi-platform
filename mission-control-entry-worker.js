import customerEntryWorker from './customer-entry-worker.js';
import { handleAgentMissionControl } from './ai-agent-control.js';
import { handleDeviceControl } from './device-control.js';
import { handleMarketingAdminControl } from './marketing-admin-control.js';
import { handleMarketingLedgerControl } from './marketing-ledger-control.js';
import { handleMarketingOrderConnectors } from './marketing-order-connectors.js';
import { handleAuthorBillingControl, runAuthorBillingSchedule } from './author-billing-control.js';
import { handleSystemHealthControl } from './system-health-control.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function errorResponse(message, code) {
  return applyApiSecurityHeaders(new Response(JSON.stringify({ error:message, code }), {
    status:500,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  }));
}

export default {
  async fetch(request, env, ctx) {
    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;

    const path = new URL(request.url).pathname;
    // Creator AI billing is intentionally isolated from the shared membership router.
    // D1 is the billing source of truth and every paid Creator AI call re-verifies it.
    if (path.startsWith('/api/author/billing/')) {
      try {
        const response = await handleAuthorBillingControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Author billing control error', error);
        return errorResponse('Creator AI 결제 처리 중 오류가 발생했습니다.', 'AUTHOR_BILLING_CONTROL_ERROR');
      }
    }

    // MarketingAI Operations Console is a read-only control-plane surface. Keep it
    // ahead of the shared customer router so admin auth and API security stay explicit.
    if (path.startsWith('/api/marketing/admin/')) {
      try {
        const response = await handleMarketingAdminControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Marketing AI admin control error', error);
        return errorResponse('Marketing AI 운영 API 처리 중 오류가 발생했습니다.', 'MARKETING_ADMIN_CONTROL_ERROR');
      }
    }

    // POS / delivery-app source adapters are store-scoped and import-only. Raw customer
    // identity is transformed in memory into the Marketing ledger pseudonym and discarded.
    if (path.startsWith('/api/marketing/connectors/')) {
      try {
        const response = await handleMarketingOrderConnectors(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Marketing order connector error', error);
        return errorResponse('Marketing 주문·POS 연결 처리 중 오류가 발생했습니다.', 'MARKETING_ORDER_CONNECTOR_ERROR');
      }
    }

    // Customer/organization Marketing ledger is scoped by the central Marketing
    // workspace membership and never exposes raw customer identity.
    if (path.startsWith('/api/marketing/ledger/')) {
      try {
        const response = await handleMarketingLedgerControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Marketing ledger control error', error);
        return errorResponse('Marketing CRM 원장 처리 중 오류가 발생했습니다.', 'MARKETING_LEDGER_CONTROL_ERROR');
      }
    }

    // Read-only admin System Health. Collection runs out-of-band in GitHub Actions,
    // so this route only reads tiny daily aggregate rows from D1.
    if (path === '/api/control/system-health') {
      try {
        const response = await handleSystemHealthControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('System Health control error', error);
        return errorResponse('System Health 처리 중 오류가 발생했습니다.', 'SYSTEM_HEALTH_CONTROL_ERROR');
      }
    }

    if (path.startsWith('/api/control/devices') || path.startsWith('/api/device-agent')) {
      try {
        const response = await handleDeviceControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Device Control error', error);
        return errorResponse('Device Control 처리 중 오류가 발생했습니다.', 'DEVICE_CONTROL_ERROR');
      }
    }

    if (path.startsWith('/api/control/ai/')) {
      try {
        const response = await handleAgentMissionControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('AI Mission Control error', error);
        return errorResponse('AI Mission Control 처리 중 오류가 발생했습니다.', 'AI_MISSION_CONTROL_ERROR');
      }
    }

    const response = await customerEntryWorker.fetch(request, env, ctx);
    return applyApiSecurityHeaders(response);
  },

  async scheduled(controller, env, ctx) {
    const authorBilling = runAuthorBillingSchedule(env).catch(error => {
      console.error('Author billing schedule error', error);
      return { processed:0, error:'author_billing_schedule_failed' };
    });
    if (ctx?.waitUntil) ctx.waitUntil(authorBilling);
    if (typeof customerEntryWorker.scheduled === 'function') {
      return customerEntryWorker.scheduled(controller, env, ctx);
    }
    return authorBilling;
  },
};