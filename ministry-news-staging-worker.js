// Isolated staging for 사역소식 허브: same app, in-memory sample data, no D1, no mail, admin API fails closed.
import { createApp } from './ministry-news-core.js';
import { createMemoryStore } from './ministry-news-memory-store.js';

const SAMPLE = [
  { id: 'sample-1', org: 'mission', kind: 'activity', eventDate: '2026-10-03', title: '[스테이징 예시] 가을 공동체 여행', summary: '유학생과 함께한 1박 2일 공동체 여행입니다.', body: '', photos: [], visibility: 'public', status: 'active' },
  { id: 'sample-2', org: 'church', kind: 'news', eventDate: '2026-10-26', title: '[스테이징 예시] 주일모임 소식', summary: '말씀나눔과 교제를 이어갔습니다.', body: '', photos: [], visibility: 'public', status: 'active' },
  { id: 'sample-3', org: 'shared', kind: 'prayer', eventDate: '2026-11-01', title: '[스테이징 예시] 기도제목', summary: '후원자에게만 보이는 예시 기도제목입니다.', body: '', photos: [], visibility: 'partners', status: 'active' },
].map(item => ({ ...item, createdAt: `${item.eventDate}T00:00:00.000Z`, updatedAt: `${item.eventDate}T00:00:00.000Z`, createdBy: 'staging', updatedBy: 'staging' }));

const HEADERS = { 'x-ekodi-data-mode': 'isolated-staging', 'x-ekodi-route': 'ministry-news-staging' };
const store = createMemoryStore({ items: SAMPLE });
const app = createApp({
  store,
  authenticate: async () => ({ response: new Response(JSON.stringify({ error: 'staging_auth_required', dataMode: 'isolated-staging' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...HEADERS } }) }),
  mailer: { configured: false },
  extraHeaders: HEADERS,
});

export default { fetch: request => app(request) };
