import apiWorker from './api-worker.js';
import { handleCustomerAuth } from './customer-auth.js';
import { handleAdminGoogleAuth } from './admin-google-auth.js';

const LEGACY_ADMIN_PASSWORD_PATHS = new Set([
  '/api/setup',
  '/api/login',
  '/api/password/reset',
  '/api/password/change',
]);

function googleAdminEnabled(env = {}) {
  return String(env.GOOGLE_CLIENT_ID || '').trim().endsWith('.apps.googleusercontent.com');
}

function googleOnlyResponse() {
  return new Response(JSON.stringify({
    error: '관리자 비밀번호 로그인은 비활성화되었습니다. 사전 등록된 Google 계정으로 로그인해 주세요.',
    code: 'GOOGLE_ADMIN_LOGIN_REQUIRED',
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

    if (googleAdminEnabled(env) && request.method === 'POST' && LEGACY_ADMIN_PASSWORD_PATHS.has(path)) {
      return googleOnlyResponse();
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
          },
        });
      }
    }
    if (path.startsWith('/api/customer/') || path.startsWith('/api/customers/')) {
      try {
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
          },
        });
      }
    }
    return apiWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return apiWorker.scheduled(controller, env, ctx);
  },
};
