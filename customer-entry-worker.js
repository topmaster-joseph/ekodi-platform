import apiWorker from './api-worker.js';
import { handleCoreApi } from './core-api.js';
import { handleCustomerAuth } from './customer-auth.js';
import { handleFederatedCustomerAuth } from './customer-federated-auth.js';
import { handleGoogleCustomerPreregistration } from './customer-google-prereg.js';
import { handleCustomerMemberDirectory } from './customer-member-directory.js';
import { handleMembershipBilling, runMembershipBillingSchedule } from './membership-billing.js';
import { handleAdminGoogleAuth } from './admin-google-auth.js';
import { handleBooksRequest } from './books-control.js';
import { handleBooksFinanceRequest } from './books-finance-control.js';
import { handleBooksDistributionRequest } from './books-distribution-control.js';
import { handleBooksPipelineRequest } from './books-pipeline-control.js';
import { handleBooksRoyaltyRequest } from './books-royalty-control.js';
import { handleCommunityReportsRequest, runCommunityReportSchedule } from './community-reports-control.js';
import { handleAffiliateRequest } from './affiliate-control.js';
import { handleMallAdminRequest } from './mall-admin-control.js';
import { handleMallPartnerRequest } from './mall-partner-control.js';
import { runAffiliateAutomation } from './coupang-partners-automation.js';
import { handleSocialRegistry } from './social-registry-api.js';

const LEGACY_ADMIN_PASSWORD_PATHS = new Set([
  '/api/setup',
  '/api/login',
  '/api/password/reset',
  '/api/password/change',
]);
const LEGACY_CUSTOMER_PASSWORD_PATHS = new Set(['/api/customer/login']);

function googleAdminEnabled(env = {}) {
  return String(env.GOOGLE_CLIENT_ID || '').trim().endsWith('.apps.googleusercontent.com');
}

function disabledPasswordResponse(kind = 'admin') {
  const admin = kind === 'admin';
  return new Response(JSON.stringify({
    error: admin
      ? '관리자 비밀번호 로그인은 비활성화되었습니다. EKODI 통합인증센터의 사전 등록된 Google 계정으로 로그인해 주세요.'
      : '고객 비밀번호 로그인은 비활성화되었습니다. EKODI 통합인증센터의 Google 계정으로 로그인해 주세요.',
    code: admin ? 'GOOGLE_ADMIN_LOGIN_REQUIRED' : 'CENTRAL_CUSTOMER_LOGIN_REQUIRED',
  }), {
    status: 410,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;

    if (path.startsWith('/api/core/v1')) {
      try {
        const response = await handleCoreApi(request, env);
        if (response) return response;
      } catch (error) {
        console.error('EKODI Core API error', error);
        return new Response(JSON.stringify({
          error: 'EKODI Core API 처리 중 오류가 발생했습니다.',
          code: 'CORE_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      }
    }

    if (path.startsWith('/api/membership/')) {
      try {
        const response = await handleMembershipBilling(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Membership and billing API error', error);
        return new Response(JSON.stringify({
          error: '회원등급·구독 API 처리 중 오류가 발생했습니다.',
          code: 'MEMBERSHIP_BILLING_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            ...(request.headers.get('origin') && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(request.headers.get('origin')) ? { 'access-control-allow-origin': request.headers.get('origin'), vary: 'Origin' } : {}),
          },
        });
      }
    }

    if (path === '/api/social/registry' || path.startsWith('/api/control/social/')
      || (request.method === 'OPTIONS' && (path.startsWith('/api/social/') || path.startsWith('/api/control/social/')))) {
      try {
        const response = await handleSocialRegistry(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Social registry API error', error);
        return new Response(JSON.stringify({
          error: '소셜채널 Registry API 처리 중 오류가 발생했습니다.',
          code: 'SOCIAL_REGISTRY_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      }
    }

    if (googleAdminEnabled(env) && request.method === 'POST' && LEGACY_ADMIN_PASSWORD_PATHS.has(path)) {
      return disabledPasswordResponse('admin');
    }
    if (request.method === 'POST' && LEGACY_CUSTOMER_PASSWORD_PATHS.has(path)) {
      return disabledPasswordResponse('customer');
    }

    if (path.startsWith('/api/community/admin/reports') && request.method !== 'OPTIONS') {
      try {
        const response = await handleCommunityReportsRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Community ministry reports API error', error);
        return new Response(JSON.stringify({ error: '사역보고 운영 API 처리 중 오류가 발생했습니다.', code: 'COMMUNITY_REPORTS_API_ERROR' }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            ...(request.headers.get('origin') && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(request.headers.get('origin')) ? { 'access-control-allow-origin': request.headers.get('origin'), vary: 'Origin' } : {}),
          },
        });
      }
    }

    if (path.startsWith('/api/mall/admin/providers') || path.startsWith('/api/mall/providers/')) {
      try {
        const response = await handleMallPartnerRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Mall Partner API error', error);
        return new Response(JSON.stringify({ error: '에코디몰 제휴처 API 처리 중 오류가 발생했습니다.', code: 'MALL_PARTNER_API_ERROR' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        });
      }
    }
    if (path.startsWith('/api/mall/admin')) {
      try {
        const response = await handleMallAdminRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Mall Admin API error', error);
        return new Response(JSON.stringify({ error: '에코디몰 운영 API 처리 중 오류가 발생했습니다.', code: 'MALL_ADMIN_API_ERROR' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        });
      }
    }

    if (path.startsWith('/api/affiliate') && request.method !== 'OPTIONS') {
      try {
        const response = await handleAffiliateRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Affiliate control API error', error);
        return new Response(JSON.stringify({
          error: '제휴마케팅 운영 API 처리 중 오류가 발생했습니다.',
          code: 'AFFILIATE_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            ...(request.headers.get('origin') && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(request.headers.get('origin')) ? { 'access-control-allow-origin': request.headers.get('origin'), vary: 'Origin' } : {}),
          },
        });
      }
    }

    if (path.startsWith('/api/books') && request.method !== 'OPTIONS') {
      try {
        if (path.startsWith('/api/books/admin/royalties')) {
          const royaltyResponse = await handleBooksRoyaltyRequest(request, env);
          if (royaltyResponse) return royaltyResponse;
        }
        if (path.startsWith('/api/books/admin/pipeline')) {
          const pipelineResponse = await handleBooksPipelineRequest(request, env);
          if (pipelineResponse) return pipelineResponse;
        }
        if (path.startsWith('/api/books/admin/distribution')) {
          const distributionResponse = await handleBooksDistributionRequest(request, env);
          if (distributionResponse) return distributionResponse;
        }
        if (path.startsWith('/api/books/admin/finance')) {
          const financeResponse = await handleBooksFinanceRequest(request, env);
          if (financeResponse) return financeResponse;
        }
        const response = await handleBooksRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Books publishing API error', error);
        return new Response(JSON.stringify({
          error: '출판 운영 API 처리 중 오류가 발생했습니다.',
          code: 'BOOKS_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            ...(request.headers.get('origin') && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(request.headers.get('origin')) ? { 'access-control-allow-origin': request.headers.get('origin'), vary: 'Origin' } : {}),
          },
        });
      }
    }

    if (path.startsWith('/api/google/') || path.startsWith('/api/admin-access/')) {
      try {
        return await handleAdminGoogleAuth(request, env);
      } catch (error) {
        console.error('Google administrator authentication API error', error);
        return new Response(JSON.stringify({
          error: 'Google 관리자 인증 API 처리 중 오류가 발생했습니다.',
          code: 'ADMIN_GOOGLE_AUTH_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          ...(request.headers.get('origin') && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(request.headers.get('origin')) ? { 'access-control-allow-origin': request.headers.get('origin'), vary: 'Origin' } : {}),
          },
        });
      }
    }
    if (path.startsWith('/api/customer/') || path.startsWith('/api/customers/')) {
      try {
        const directory = await handleCustomerMemberDirectory(request, env);
        if (directory) return directory;
        const googlePreregistration = await handleGoogleCustomerPreregistration(request, env);
        if (googlePreregistration) return googlePreregistration;
        const federated = await handleFederatedCustomerAuth(request, env);
        if (federated) return federated;
        return await handleCustomerAuth(request, env);
      } catch (error) {
        console.error('Customer authentication API error', error);
        return new Response(JSON.stringify({
          error: '고객 인증 API 처리 중 오류가 발생했습니다.',
          code: 'CUSTOMER_AUTH_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          ...(request.headers.get('origin') && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(request.headers.get('origin')) ? { 'access-control-allow-origin': request.headers.get('origin'), vary: 'Origin' } : {}),
          },
        });
      }
    }
    return apiWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCommunityReportSchedule(env).catch(error => console.error('Community report schedule failed', error)));
    ctx.waitUntil(runMembershipBillingSchedule(env).catch(error => console.error('Membership billing schedule failed', error)));
    ctx.waitUntil(runAffiliateAutomation(env, { reason: 'schedule' }).catch(error => console.error('EKODI Mall automatic curation schedule failed', error)));
    return apiWorker.scheduled(controller, env, ctx);
  },
};