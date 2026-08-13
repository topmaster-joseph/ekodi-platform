import apiWorker from './api-worker.js';
import { handleCustomerAuth } from './customer-auth.js';
import { handleFederatedCustomerAuth } from './customer-federated-auth.js';
import { handleGoogleCustomerPreregistration } from './customer-google-prereg.js';
import { handleAdminGoogleAuth } from './admin-google-auth.js';
import { handleBooksRequest } from './books-control.js';
import { handleAffiliateRequest } from './affiliate-control.js';

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

function apiError(message, code, request, env) {
  const origin = request.headers.get('origin');
  const allowed = origin && String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(origin);
  return new Response(JSON.stringify({ error: message, code }), {
    status: 500,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(allowed ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;

    if (googleAdminEnabled(env) && request.method === 'POST' && LEGACY_ADMIN_PASSWORD_PATHS.has(path)) {
      return disabledPasswordResponse('admin');
    }
    if (request.method === 'POST' && LEGACY_CUSTOMER_PASSWORD_PATHS.has(path)) {
      return disabledPasswordResponse('customer');
    }

    if (path.startsWith('/api/affiliate') && request.method !== 'OPTIONS') {
      try {
        const response = await handleAffiliateRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Affiliate control API error', error);
        return apiError('제휴마케팅 운영 API 처리 중 오류가 발생했습니다.', 'AFFILIATE_API_ERROR', request, env);
      }
    }

    if (path.startsWith('/api/books') && request.method !== 'OPTIONS') {
      try {
        const response = await handleBooksRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Books publishing API error', error);
        return apiError('출판 운영 API 처리 중 오류가 발생했습니다.', 'BOOKS_API_ERROR', request, env);
      }
    }

    if (path.startsWith('/api/google/') || path.startsWith('/api/admin-access/')) {
      try {
        return await handleAdminGoogleAuth(request, env);
      } catch (error) {
        console.error('Google administrator authentication API error', error);
        return apiError('Google 관리자 인증 API 처리 중 오류가 발생했습니다.', 'ADMIN_GOOGLE_AUTH_API_ERROR', request, env);
      }
    }
    if (path.startsWith('/api/customer/') || path.startsWith('/api/customers/')) {
      try {
        const googlePreregistration = await handleGoogleCustomerPreregistration(request, env);
        if (googlePreregistration) return googlePreregistration;
        const federated = await handleFederatedCustomerAuth(request, env);
        if (federated) return federated;
        return await handleCustomerAuth(request, env);
      } catch (error) {
        console.error('Customer authentication API error', error);
        return apiError('고객 인증 API 처리 중 오류가 발생했습니다.', 'CUSTOMER_AUTH_API_ERROR', request, env);
      }
    }
    return apiWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return apiWorker.scheduled(controller, env, ctx);
  },
};
