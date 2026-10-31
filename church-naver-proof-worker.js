// Isolated Naver Search Advisor proof, scoped to one legacy church URL.
// No domain routing, authentication or DNS mutation is performed here.
import { searchVerificationFileResponse } from './search-engine-verification.js';

export const CHURCH_HOST = 'ekodichurch.kr';
export const CHURCH_NAVER_PATH = '/naver85321326d5553a0caa3a944158fc2969.html';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== CHURCH_HOST || url.pathname !== CHURCH_NAVER_PATH) {
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    // Registry is the single owner-issued source of truth; this response has
    // an exact file body, not the redirecting /ekodichurch homepage.
    const proof = searchVerificationFileResponse(url.pathname, { head: request.method === 'HEAD' });
    return proof || new Response('Owner proof missing', { status: 503 });
  },
};
