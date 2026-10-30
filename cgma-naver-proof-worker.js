// CGMA's customer-owned domain retains its existing site and DNS.
// This Worker handles one Naver Search Advisor ownership proof URL only.
export const CGMA_NAVER_HOST = 'cgma.or.kr';
export const CGMA_NAVER_FILE_PATH = '/navere5d0557aef9688f08735f4bf0152c795.html';
export const CGMA_NAVER_FILE_BODY = 'naver-site-verification: navere5d0557aef9688f08735f4bf0152c795.html';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== CGMA_NAVER_HOST || url.pathname !== CGMA_NAVER_FILE_PATH)
      return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    return new Response(request.method === 'HEAD' ? null : CGMA_NAVER_FILE_BODY, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'x-ekodi-route': 'cgma-naver-ownership',
      },
    });
  },
};
