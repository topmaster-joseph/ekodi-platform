import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRoutes, runtimeLlms, runtimeSitemap } from '../public-discovery-runtime.js';

const dynamic = [{
  source_type: 'event',
  source_key: 'demo-event',
  canonical_url: 'https://ekodi.kr/demo/events/1',
  parent_url: 'https://ekodi.kr/demo',
  title: '공개 행사',
  description: '공개 행사 설명',
  schema_type: 'Event',
  language: 'ko',
  image_url: null,
  published_at: '2026-10-01T00:00:00Z',
  modified_at: '2026-10-02T00:00:00Z',
  public_payload: { startDate: '2026-10-10T10:00:00+09:00' },
}];

test('runtime discovery merges published registry records with static registry routes', () => {
  const routes = mergeRoutes(dynamic);
  assert.ok(routes.some(route => route.path === '/demo/events/1'));
  assert.ok(routes.some(route => route.path === '/'));
});

test('runtime sitemap includes dynamic lastmod and canonical URL', () => {
  const xml = runtimeSitemap(dynamic);
  assert.match(xml, /https:\/\/ekodi\.kr\/demo\/events\/1/);
  assert.match(xml, /<lastmod>2026-10-02T00:00:00Z<\/lastmod>/);
  assert.doesNotMatch(xml, /\/admin(?:\/|<)/);
});

test('runtime llms projection exposes only supplied public registry records', () => {
  const text = runtimeLlms(dynamic);
  assert.match(text, /## Live Public Registry/);
  assert.match(text, /공개 행사/);
  assert.match(text, /https:\/\/ekodi\.kr\/demo\/events\/1/);
});

test('external canonical records are ignored', () => {
  const routes = mergeRoutes([{ ...dynamic[0], canonical_url: 'https://example.com/private' }]);
  assert.equal(routes.some(route => route.path === '/private'), false);
});
