import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  SEO_DISCLOSURES, SEO_GENERATION_CHANNELS, FREE_AI_PROVIDER_ALLOWLIST,
  generateCampaignContent, lintMarketingText, sanitizeMarketingText, expandKeywords, normalizeProduct, resolveFreeAiProvider,
} from '../marketing-seo-engine.js';
import { handleContentStudio } from '../marketing-content-studio.js';
import { handleMarketingAdminControl } from '../marketing-admin-control.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const MIGRATION_FILES = fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'));
const STUDIO = 'https://ekodi.kr/api/marketing/admin/studio';
const ADMIN_TOKEN = 'seo-admin-session-token';
const NOW = '2026-10-24T03:00:00.000Z';

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of MIGRATION_FILES) db.exec(fs.readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  const statement = (sql, params = []) => ({
    bind:(...args) => statement(sql, args),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results:db.prepare(sql).all(...params) }; },
    async run() { const r = db.prepare(sql).run(...params); return { meta:{ changes:Number(r.changes), last_row_id:Number(r.lastInsertRowid) } }; },
  });
  return { raw:db, prepare:sql => statement(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function seed() {
  const env = { DB:d1() };
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  env.DB.raw.prepare(`INSERT INTO admins(email,password_hash,password_salt,birth_hash,birth_salt,role,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run('admin@example.org', 'x', 'x', 'x', 'x', 'super_admin', now);
  env.DB.raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256(ADMIN_TOKEN), 1, future, now);
  return env;
}

const call = (env, method, path, body, token = ADMIN_TOKEN) => handleMarketingAdminControl(new Request(`${STUDIO}${path}`, {
  method,
  headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
  ...(body ? { body:JSON.stringify(body) } : {}),
}), env);
const jsonOf = async response => ({ status:response.status, body:await response.json() });

const COUPANG = Object.freeze({
  name:'에코디 보온 텀블러', category:'텀블러', priceKrw:15900, features:['500ml 이중 진공 구조', '식기세척기 사용 가능'],
  audience:'출퇴근 직장인', saleType:'affiliate', partner:'coupang', url:'https://link.coupang.com/a/ekodi1', imageUrls:['https://ekodi.kr/assets/tumbler.jpg'],
});
const DIRECT = Object.freeze({
  name:'청계면 무화과 잼', category:'잼', priceKrw:12000, features:['무안 청계면 무화과 사용', '250g 유리병'],
  saleType:'direct', url:'https://ekodi.kr/ekodimall/p/FIGJAM01',
});

const allText = result => [
  result.buyingGuide.title, result.buyingGuide.summaryAnswer, result.buyingGuide.body,
  ...result.buyingGuide.faq.flatMap(item => [item.q, item.a]),
  ...result.variants.flatMap(v => [v.title, v.body, ...(v.hashtags || []), ...(v.slides || [])]),
].join('\n');

test('lintMarketingText flags fabricated experience, ranking guarantees and medical absolutes', () => {
  const cases = {
    '직접 써보니 너무 좋아요': 'fabricated_experience',
    '한 달 써본 결과 만족': 'fabricated_experience',
    '제가 사용해 본 제품': 'fabricated_experience',
    '솔직 후기 남깁니다': 'fabricated_experience',
    '올해의 인생템': 'fabricated_experience',
    '강력 추천합니다': 'fabricated_experience',
    '네이버 검색 1위 상품': 'ranking_guarantee',
    '상위 노출 보장': 'ranking_guarantee',
    'AI 추천 보장 콘텐츠': 'ranking_guarantee',
    '아토피 완치': 'medical_absolute',
    '100% 효과': 'medical_absolute',
  };
  for (const [text, rule] of Object.entries(cases)) {
    const issues = lintMarketingText(text);
    assert.ok(issues.some(issue => issue.rule === rule), `${text} → ${rule}`);
  }
  assert.deepEqual(lintMarketingText('텀블러 고를 때 확인할 점을 정리했습니다.'), []);
  assert.equal(sanitizeMarketingText('좋은 텀블러입니다. 직접 써보니 최고예요. 가격을 확인하세요.'), '좋은 텀블러입니다. 가격을 확인하세요.');
});

test('template generation is deterministic, lint-clean and covers every channel (coupang affiliate)', async () => {
  const first = await generateCampaignContent(COUPANG, { now:NOW });
  const second = await generateCampaignContent(COUPANG, { now:NOW });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(first.mode, 'template');
  assert.deepEqual(first.variants.map(v => v.key), SEO_GENERATION_CHANNELS);
  assert.deepEqual(lintMarketingText(allText(first)), []);
  for (const variant of first.variants) {
    assert.equal(variant.disclosure, SEO_DISCLOSURES.coupang);
    assert.equal(variant.body.split('\n')[0], SEO_DISCLOSURES.coupang, `${variant.key} disclosure first line`);
    assert.equal(variant.aiGenerated, false);
    assert.ok(variant.hashtags.length > 0 && variant.hashtags.length <= 10);
  }
  const byKey = Object.fromEntries(first.variants.map(v => [v.key, v]));
  assert.ok(byKey.instagram.slides.length >= 3 && byKey.instagram.slides.length <= 10);
  assert.ok(byKey.instagram_reel.script.hook && byKey.instagram_reel.script.scenes.length >= 2 && byKey.instagram_reel.script.caption);
  assert.ok(byKey.facebook_reel.script.scenes.length >= 2);
  assert.ok(byKey.youtube_short.title.length <= 100 && byKey.youtube_short.description && byKey.youtube_short.script);
  assert.ok(byKey.youtube_short.hashtags.includes('Shorts'));
  assert.match(byKey.naver_blog.body, /\n## /);
  assert.match(byKey.naver_blog.body, /## 자주 묻는 질문/);

  const guide = first.buyingGuide;
  assert.equal(guide.updatedAt, '2026-10-24');
  const sentences = guide.summaryAnswer.split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.ok(sentences.length >= 2 && sentences.length <= 3, guide.summaryAnswer);
  assert.match(guide.summaryAnswer, /15,900원/);
  assert.ok(guide.comparisonCriteria.length >= 3 && guide.checklist.length >= 3 && guide.faq.length >= 3);
  assert.deepEqual(guide.sources, ['https://link.coupang.com/a/ekodi1']);
  assert.equal(first.keywords.primary, COUPANG.name);
  assert.ok(first.keywords.related.includes('텀블러 고르는 법'));
  assert.ok(first.keywords.questions.length >= 3);
});

test('direct sale uses the EKODIBIZ disclosure; generic affiliate uses the generic disclosure', async () => {
  const direct = await generateCampaignContent(DIRECT, { now:NOW, channels:['facebook','naver_blog'] });
  assert.deepEqual(direct.variants.map(v => v.key), ['facebook','naver_blog']);
  for (const variant of direct.variants) assert.equal(variant.body.split('\n')[0], SEO_DISCLOSURES.direct);
  assert.deepEqual(lintMarketingText(allText(direct)), []);
  const other = await generateCampaignContent({ ...COUPANG, partner:'naver' }, { now:NOW, channels:['facebook'] });
  assert.equal(other.variants[0].disclosure, SEO_DISCLOSURES.affiliate);
});

test('facts come only from input: banned input phrases are dropped, no rating or invented numbers appear', async () => {
  const result = await generateCampaignContent({ ...DIRECT, features:[...DIRECT.features, '직접 써보니 인생템', '검색 1위 상품'], audience:'' }, { now:NOW });
  assert.deepEqual([...result.product.rejectedInputs], ['직접 써보니 인생템', '검색 1위 상품']);
  const text = allText(result);
  assert.deepEqual(lintMarketingText(text), []);
  assert.doesNotMatch(text, /별점|평점|리뷰 \d|만족도 \d/);
  const numbers = new Set(text.match(/\d[\d,]*/g).map(n => n.replace(/,/g, '')));
  for (const n of numbers) assert.ok(['12000','250','2026','10','24'].includes(n) || Number(n) <= 30, `unexpected number ${n}`);
  assert.throws(() => normalizeProduct({ ...DIRECT, name:'완치 보장 크림' }), { code:'PRODUCT_NAME_INTEGRITY' });
});

test('keyword expansion uses DataLab-style signals only when relevant (no network)', () => {
  const product = normalizeProduct(COUPANG);
  const keywords = expandKeywords(product, { risingKeywords:['텀블러 세척', '캠핑 의자', '검색 1위 텀블러'] });
  assert.ok(keywords.related.includes('텀블러 세척'));
  assert.ok(!keywords.related.includes('캠핑 의자'));
  assert.ok(!keywords.related.some(k => /1위/.test(k)));
});

test('ai mode: refused unless enabled AND a free-tier provider resolves; falls back to template on failure', async () => {
  let invoked = 0;
  const router = {
    providerStatus:() => [
      { id:'openai-api', costClass:'paid-opt-in', available:true, automaticEligible:false },
      { id:'groq-free', costClass:'free-preferred', available:true, automaticEligible:true },
    ],
    async invokeProviderWithMeta() { invoked += 1; throw new Error('groq_429'); },
  };
  const disabled = await generateCampaignContent(COUPANG, { mode:'ai', env:{}, router, now:NOW });
  assert.equal(disabled.mode, 'template');
  assert.equal(disabled.fallbackReason, 'MARKETING_AI_GENERATION_DISABLED');
  assert.equal(invoked, 0);

  const paidOnly = { providerStatus:() => [{ id:'openai-api', costClass:'paid-opt-in', available:true, automaticEligible:true }], invokeProviderWithMeta() { invoked += 1; } };
  assert.deepEqual(resolveFreeAiProvider({ MARKETING_AI_GENERATION_ENABLED:'true' }, { router:paidOnly }), { ok:false, reason:'NO_FREE_PROVIDER_AVAILABLE' });
  assert.ok(!FREE_AI_PROVIDER_ALLOWLIST.includes('openai-api'));

  const failed = await generateCampaignContent(COUPANG, { mode:'ai', env:{ MARKETING_AI_GENERATION_ENABLED:'true' }, router, now:NOW });
  assert.equal(invoked, 1);
  assert.equal(failed.mode, 'template');
  assert.match(failed.fallbackReason, /^AI_FAILED/);
  assert.ok(failed.variants.every(v => v.aiGenerated === false));
});

test('ai mode output is linted, number-checked and disclosure-first', async () => {
  const router = {
    providerStatus:() => [{ id:'groq-free', costClass:'free-preferred', available:true, automaticEligible:true }],
    async invokeProviderWithMeta(env, providerId) {
      assert.equal(providerId, 'groq-free');
      return { text:JSON.stringify({ bodies:{
        facebook:'출퇴근길 따뜻한 음료가 필요할 때 에코디 보온 텀블러를 살펴보세요. 직접 써보니 최고예요. 보온력 98% 유지됩니다. 500ml 이중 진공 구조라 가방에 넣기 좋습니다.',
        instagram:'검색 1위 상품!',
      } }) };
    },
  };
  const result = await generateCampaignContent(COUPANG, { mode:'ai', channels:['facebook','instagram'], env:{ MARKETING_AI_GENERATION_ENABLED:'true' }, router, now:NOW });
  assert.equal(result.mode, 'ai');
  const [facebook, instagram] = result.variants;
  assert.equal(facebook.aiGenerated, true);
  assert.equal(facebook.body.split('\n')[0], SEO_DISCLOSURES.coupang);
  assert.doesNotMatch(facebook.body, /써보니|98%/);
  assert.match(facebook.body, /500ml 이중 진공 구조/);
  assert.equal(instagram.aiGenerated, false, 'rejected AI body falls back to template');
  assert.deepEqual(lintMarketingText(allText(result)), []);
});

test('POST /studio/generate creates one content item and N pending_review variants with tracking codes', async () => {
  const env = await seed();
  const { status, body } = await jsonOf(await call(env, 'POST', '/generate', { product:COUPANG, channels:['facebook','instagram','youtube_short','naver_blog'] }));
  assert.equal(status, 201);
  assert.equal(body.mode, 'template');
  assert.equal(body.variantIds.length, 4);
  assert.ok(body.buyingGuide.summaryAnswer);
  const rows = env.DB.raw.prepare('SELECT * FROM marketing_content_variants ORDER BY id').all();
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => `${r.channel}:${r.format}`), ['facebook:feed','instagram:carousel','youtube:short','naver_blog:blog_draft']);
  assert.equal(new Set(rows.map(r => r.tracking_code)).size, 4);
  for (const row of rows) {
    assert.equal(row.status, 'pending_review');
    assert.equal(row.ai_generated, 0);
    assert.equal(row.content_id, body.contentId);
    assert.equal(row.subject_type, 'tenant');
    assert.equal(row.subject_key, 'ekodimall');
    assert.ok(row.body.startsWith(SEO_DISCLOSURES.coupang));
    assert.equal(row.disclosure_text, SEO_DISCLOSURES.coupang);
    const link = new URL(row.link_url);
    assert.equal(link.hostname, 'link.coupang.com');
    assert.equal(link.searchParams.get('utm_content'), row.tracking_code);
    assert.equal(link.searchParams.get('utm_medium'), 'social');
    assert.deepEqual(lintMarketingText(row.body), []);
  }
  const item = env.DB.raw.prepare('SELECT * FROM marketing_content_items WHERE id=?').get(body.contentId);
  assert.equal(item.approval_state, 'draft');
  assert.equal(item.content_type, 'article');
  const stored = JSON.parse(item.content_json).seoEngine;
  assert.equal(stored.mode, 'template');
  assert.equal(stored.buyingGuide.updatedAt.length, 10);
  const actions = env.DB.raw.prepare('SELECT action FROM marketing_publication_audit ORDER BY id').all().map(r => r.action);
  assert.deepEqual(actions, ['studio_campaign_generated', ...Array(4).fill('studio_variant_created')]);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM marketing_publication_jobs').get().n, 0, 'generation never schedules');
});

test('generate: direct sale on ekodi.kr, ai request falls back when disabled, bad input rejected', async () => {
  const env = await seed();
  const status = await jsonOf(await call(env, 'GET', '/generate'));
  assert.equal(status.status, 200);
  assert.equal(status.body.aiEnabled, false);
  assert.equal(status.body.paidAllowed, false);
  const direct = await jsonOf(await call(env, 'POST', '/generate', { product:DIRECT, channels:['facebook'], mode:'ai' }));
  assert.equal(direct.status, 201);
  assert.equal(direct.body.mode, 'template');
  assert.equal(direct.body.fallbackReason, 'MARKETING_AI_GENERATION_DISABLED');
  assert.ok(direct.body.variants[0].body.startsWith(SEO_DISCLOSURES.direct));
  assert.equal(direct.body.variants[0].aiGenerated, false);
  const badLink = await jsonOf(await call(env, 'POST', '/generate', { product:{ ...DIRECT, url:'https://evil.example.com/x' } }));
  assert.equal(badLink.status, 400);
  assert.equal(badLink.body.error, 'TRACKED_LINK_REJECTED');
  const noName = await jsonOf(await call(env, 'POST', '/generate', { product:{ ...DIRECT, name:'' } }));
  assert.equal(noName.body.error, 'PRODUCT_NAME_REQUIRED');
  const noChannel = await jsonOf(await call(env, 'POST', '/generate', { product:DIRECT, channels:['tiktok'] }));
  assert.equal(noChannel.body.error, 'CHANNELS_REQUIRED');
});

test('generate: ai mode through the injected free router stores ai_generated=1', async () => {
  const env = await seed();
  env.MARKETING_AI_GENERATION_ENABLED = 'true';
  const router = {
    providerStatus:() => [{ id:'cloudflare-workers-ai', costClass:'free-preferred', available:true, automaticEligible:true }],
    async invokeProviderWithMeta() { return { text:'{"bodies":{"facebook":"에코디 보온 텀블러는 500ml 이중 진공 구조와 식기세척기 사용 가능 특징을 갖춘 텀블러입니다. 출퇴근 직장인이라면 체크리스트로 확인해 보세요."}}' }; },
  };
  const request = new Request(`${STUDIO}/generate`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ product:COUPANG, channels:['facebook'], mode:'ai' }) });
  const res = await jsonOf(await handleContentStudio(request, env, { resolveAdmin:async () => ({ authenticated:true, email:'admin@example.org' }), router }));
  assert.equal(res.status, 201);
  assert.equal(res.body.mode, 'ai');
  const row = env.DB.raw.prepare('SELECT ai_generated,status,body FROM marketing_content_variants').get();
  assert.equal(row.ai_generated, 1);
  assert.equal(row.status, 'pending_review');
  assert.ok(row.body.startsWith(SEO_DISCLOSURES.coupang));
});

test('non-admin and read-only requests cannot generate', async () => {
  const env = await seed();
  for (const token of ['', 'forged-token']) {
    const res = await call(env, 'POST', '/generate', { product:DIRECT }, token);
    assert.equal(res.status, 401);
    assert.equal((await call(env, 'GET', '/generate', null, token)).status, 401);
  }
  env.ALLOW_MUTATIONS = 'false';
  assert.equal((await call(env, 'POST', '/generate', { product:DIRECT })).status, 403);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM marketing_content_variants').get().n, 0);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM marketing_content_items WHERE content_type='article'").get().n, 0);
});

test('engine never calls a provider API directly and admin UI exposes the generator form', () => {
  const engine = fs.readFileSync(new URL('../marketing-seo-engine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /api\.openai\.com|OPENAI_API_KEY|fetch\(/);
  assert.match(engine, /from '\.\/ai-control-provider-router\.js'/);
  assert.match(engine, /evaluateAiCostEligibility/);
  const ui = fs.readFileSync(new URL('../marketing-ai-admin.js', import.meta.url), 'utf8');
  assert.match(ui, /상품으로 콘텐츠 만들기/);
  assert.match(ui, /\/api\/marketing\/admin\/studio\/generate/);
  assert.match(ui, /name="mode" value="ai" \$\{aiEnabled \? '' : 'disabled'\}/);
  const control = fs.readFileSync(new URL('../marketing-admin-control.js', import.meta.url), 'utf8');
  assert.doesNotMatch(control, /request\.method === 'POST'/);
});

test('orchestrated merge dispatches the Control API for marketing admin modules and Site Core for mall JSON-LD', () => {
  const source = fs.readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  const api = source.slice(source.indexOf('const controlApiTouched='), source.indexOf('const marketingGrowthTouched='));
  for (const file of ['marketing-admin-control.js','marketing-admin-publications.js','marketing-content-studio.js','marketing-seo-engine.js']) {
    assert.ok(api.includes(`'${file}'`), `Control API dispatch must cover ${file}`);
  }
  const site = source.slice(source.indexOf('const sharedSiteTouched='), source.indexOf('// Church public Pages'));
  for (const file of ['mall-product-jsonld.js','site-worker.js']) assert.ok(site.includes(`'${file}'`), `Site Core dispatch must cover ${file}`);
  const entry = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
  assert.match(entry, /from '\.\/marketing-admin-control\.js'/);
  assert.match(fs.readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8'), /main = "mission-control-entry-worker\.js"/);
  assert.match(fs.readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8'), /from '\.\/mall-product-jsonld\.js'/);
});
