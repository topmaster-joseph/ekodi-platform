// EKODI AI Social Growth Phase 6 — 상품 기반 SEO·AEO·GEO 콘텐츠 엔진.
// 상품 정보(입력값)만으로 키워드·구매 가이드·채널별 초안을 만든다. 생성물은 게시되지 않고,
// marketing-content-studio.js가 모두 pending_review 변형으로 저장해 관리자 검수를 거친다.
//
// 비용 정책(AI-COST-001, 추가 지출 0원):
// - mode 'template'(기본): 결정적 한국어 템플릿. 네트워크 호출·비용 없음.
// - mode 'ai': 중앙 라우터(ai-control-provider-router.js)의 무료 등급 공급자만 사용한다.
//   MARKETING_AI_GENERATION_ENABLED==='true' 이고, 공급자가 무료 허용목록 + free-preferred 비용등급 +
//   evaluateAiCostEligibility(유료 위임 예산 없음) 통과일 때만 호출한다. 실패하면 템플릿으로 되돌아간다.
//   이 모듈은 OpenAI 등 공급자 API를 직접 호출하지 않는다.
//
// 표시·광고 무결성: 모든 출력(템플릿·AI)에 lintMarketingText를 적용해 허위 사용경험·후기, 순위·AI 인용 보장,
// 의료·효능 단정 표현을 제거한다. 사실(가격·특징·대상)은 입력 상품 필드에서만 가져온다.

import { providerStatus as routerProviderStatus, invokeProviderWithMeta as routerInvoke } from './ai-control-provider-router.js';
import { evaluateAiCostEligibility } from './ai-cost-policy.js';
import { applyDisclosure } from './marketing-content-studio.js';

export const SEO_GENERATION_CHANNELS = Object.freeze(['facebook','instagram','instagram_reel','facebook_reel','youtube_short','naver_blog']);
// 생성 채널 → 스튜디오 변형(channel, format). 스튜디오 CHECK 제약(0206)과 일치해야 한다.
export const SEO_CHANNEL_TARGETS = Object.freeze({
  facebook:Object.freeze({ channel:'facebook', format:'feed' }),
  instagram:Object.freeze({ channel:'instagram', format:'carousel' }),
  instagram_reel:Object.freeze({ channel:'instagram', format:'reel' }),
  facebook_reel:Object.freeze({ channel:'facebook', format:'reel' }),
  youtube_short:Object.freeze({ channel:'youtube', format:'short' }),
  naver_blog:Object.freeze({ channel:'naver_blog', format:'blog_draft' }),
});
export const SEO_DISCLOSURES = Object.freeze({
  coupang:'이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
  affiliate:'이 게시물은 제휴 링크를 포함하며 구매 시 일정액의 수수료를 받을 수 있습니다.',
  direct:'에코디비즈 직접판매 상품입니다.',
});
// 무료 등급으로만 운영되는 공급자(우선순위 순). 유료(openai-api, anthropic-api)·크레딧형은 제외한다.
export const FREE_AI_PROVIDER_ALLOWLIST = Object.freeze(['groq-free','openrouter-free','cloudflare-workers-ai','gemini-free']);
const FREE_COST_CLASSES = Object.freeze(['free-preferred','google-free-quota']);

const INTEGRITY_RULES = Object.freeze([
  { rule:'fabricated_experience', pattern:/직접\s*써\s*보니|써\s*본\s*결과|써\s*보니|사용해\s*보니|제가\s*(?:직접\s*)?(?:사용|써)|내돈내산|솔직\s*(?:후기|리뷰)|후기|인생템|강력\s*추천(?:합니다|해요|드립니다)/ },
  { rule:'ranking_guarantee', pattern:/검색\s*1\s*위|상위\s*노출\s*보장|노출\s*보장|AI\s*추천\s*보장|AI\s*인용\s*보장|1\s*위\s*보장|판매\s*1\s*위|최저가\s*보장/i },
  { rule:'medical_absolute', pattern:/완치|100\s*%\s*효과|효과\s*100\s*%|부작용\s*(?:이\s*)?(?:전혀\s*)?없|치료\s*효과|특효|무조건\s*효과/ },
]);

const clean = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const unique = list => [...new Set(list.filter(Boolean))];
const won = value => `${new Intl.NumberFormat('ko-KR').format(value)}원`;

function engineError(code, status = 400, extra = {}) {
  return Object.assign(new Error(code), { code, status, ...extra });
}

// ---------------------------------------------------------------- 무결성 린트

export function lintMarketingText(text) {
  const source = String(text ?? '');
  const issues = [];
  for (const { rule, pattern } of INTEGRITY_RULES) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of source.matchAll(global)) issues.push({ rule, match:match[0], index:match.index });
  }
  return issues;
}

const hasIssue = text => lintMarketingText(text).length > 0;

// 문제 문장을 통째로 제거한다(부분 치환은 의미를 왜곡할 수 있다). allowNumbers가 있으면 입력에 없는 수치를 담은 문장도 제거한다.
export function sanitizeMarketingText(text, { allowNumbers = null } = {}) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  for (const line of lines) {
    if (!line.trim()) { out.push(''); continue; }
    const sentences = line.split(/(?<=[.!?。])\s+/);
    const kept = sentences.filter(sentence => !hasIssue(sentence) && !(allowNumbers && hasUnknownNumber(sentence, allowNumbers)));
    if (kept.length) out.push(kept.join(' '));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function hasUnknownNumber(sentence, allowNumbers) {
  const numbers = String(sentence).match(/\d[\d,.]*/g) || [];
  return numbers.some(raw => !allowNumbers.has(raw.replace(/[,.]+$/, '').replace(/,/g, '')));
}

// ---------------------------------------------------------------- 상품 입력

function httpsUrl(value) {
  try { const url = new URL(String(value ?? '').trim()); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function normalizeProduct(input = {}) {
  const name = clean(input.name, 120);
  if (!name) throw engineError('PRODUCT_NAME_REQUIRED');
  if (hasIssue(name)) throw engineError('PRODUCT_NAME_INTEGRITY', 400, { reason:lintMarketingText(name)[0].rule });
  const saleType = input.saleType === 'direct' ? 'direct' : input.saleType === 'affiliate' ? 'affiliate' : '';
  if (!saleType) throw engineError('SALE_TYPE_REQUIRED');
  const priceRaw = input.priceKrw === '' || input.priceKrw == null ? NaN : Number(String(input.priceKrw).replace(/[,\s원]/g, ''));
  const priceKrw = Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw) : null;
  // 입력 단계에서 무결성 위반 문구(허위 후기·순위 보장·효능 단정)를 사실 목록에서 제외한다.
  const rawFeatures = (Array.isArray(input.features) ? input.features : String(input.features ?? '').split('\n'))
    .map(item => clean(item, 120)).filter(Boolean);
  const rejectedInputs = rawFeatures.filter(hasIssue);
  const features = rawFeatures.filter(item => !hasIssue(item)).slice(0, 10);
  const audienceRaw = clean(input.audience, 120);
  if (audienceRaw && hasIssue(audienceRaw)) rejectedInputs.push(audienceRaw);
  return Object.freeze({
    name,
    category:(category => category && !hasIssue(category) ? category : '생활용품')(clean(input.category, 60)),
    priceKrw,
    features:Object.freeze(features),
    audience:hasIssue(audienceRaw) ? '' : audienceRaw,
    saleType,
    partner:saleType === 'affiliate' ? clean(input.partner, 40).toLowerCase() : '',
    url:httpsUrl(input.url),
    imageUrls:Object.freeze((Array.isArray(input.imageUrls) ? input.imageUrls : []).map(httpsUrl).filter(Boolean).slice(0, 10)),
    sources:Object.freeze((Array.isArray(input.sources) ? input.sources : []).map(httpsUrl).filter(Boolean).slice(0, 10)),
    rejectedInputs:Object.freeze(rejectedInputs.slice(0, 10)),
  });
}

export function disclosureFor(product) {
  if (product.saleType === 'direct') return SEO_DISCLOSURES.direct;
  return product.partner === 'coupang' ? SEO_DISCLOSURES.coupang : SEO_DISCLOSURES.affiliate;
}

// 받침 유무로 조사를 고른다(한글이 아니면 병기).
function josa(word, withBatchim, without) {
  const code = String(word).trim().slice(-1).charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return `${word}${(code - 0xac00) % 28 ? withBatchim : without}`;
  return `${word}${withBatchim}(${without})`;
}

// ---------------------------------------------------------------- 키워드 확장(결정적)

const STOP = new Set(['및','등','the','and','with','용','형','가능','있음','제공']);
function tokens(text) {
  return String(text ?? '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 2 && !STOP.has(token));
}
function featureKeyword(feature) {
  return tokens(feature).slice(0, 2).join(' ');
}

// signals: { trendKeywords?: string[], risingKeywords?: string[] } — DataLab 등에서 이미 받아 둔 값. 네트워크 호출은 없다.
export function expandKeywords(product, signals = {}) {
  const { name, category, features, audience, priceKrw } = product;
  const own = new Set([...tokens(name), ...tokens(category), ...features.flatMap(tokens)]);
  const signalWords = [...(Array.isArray(signals.risingKeywords) ? signals.risingKeywords : []), ...(Array.isArray(signals.trendKeywords) ? signals.trendKeywords : [])]
    .map(item => clean(item, 40)).filter(Boolean)
    .filter(keyword => tokens(keyword).some(token => own.has(token)))
    .filter(keyword => !hasIssue(keyword));
  const related = unique([
    category,
    `${category} 추천`,
    `${category} 고르는 법`,
    `${category} 비교`,
    priceKrw ? `${name} 가격` : '',
    ...features.slice(0, 4).map(featureKeyword).filter(Boolean).map(keyword => `${category} ${keyword}`),
    audience ? `${audience} ${category}` : '',
    ...signalWords,
  ].map(item => clean(item, 60))).filter(keyword => keyword !== name && !hasIssue(keyword)).slice(0, 12);
  const questions = [
    `${category} 고를 때 무엇을 확인해야 하나요?`,
    `${name}의 주요 특징은 무엇인가요?`,
    priceKrw ? `${name} 가격은 얼마인가요?` : '',
    audience ? `${josa(name, '은', '는')} 누구에게 맞나요?` : '',
    `${josa(name, '은', '는')} 어디에서 구매할 수 있나요?`,
  ].filter(Boolean);
  return Object.freeze({ primary:name, related:Object.freeze(related), questions:Object.freeze(questions) });
}

// ---------------------------------------------------------------- 구매 가이드(AEO/GEO)

function isoDate(now) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString().slice(0, 10);
}

function whereToBuy(product) {
  if (product.saleType === 'direct') return '에코디비즈가 에코디몰에서 직접 판매합니다. 상품 링크에서 재고와 배송 안내를 확인할 수 있습니다.';
  const partner = product.partner === 'coupang' ? '쿠팡' : '제휴 판매처';
  return `${partner} 상품 페이지에서 구매할 수 있습니다. 가격과 배송 조건은 구매 시점에 판매처 표시를 기준으로 확인해 주세요.`;
}

export function buildBuyingGuide(product, keywords, { now } = {}) {
  const { name, category, features, audience, priceKrw } = product;
  const updatedAt = isoDate(now);
  const featureText = features.slice(0, 2).join(', ');
  const summary = [
    `${josa(name, '은', '는')} ${category} 상품${featureText ? `으로, 판매 정보 기준 주요 특징은 ${featureText}입니다.` : '입니다.'}`,
    priceKrw ? `등록 가격은 ${won(priceKrw)}이며(${updatedAt} 기준) 구매 시점에 달라질 수 있습니다.` : '',
    audience ? `${audience}에게 맞는지 아래 비교 기준과 체크리스트로 확인해 보세요.` : '구매 전 아래 비교 기준과 체크리스트로 필요에 맞는지 확인해 보세요.',
  ].filter(Boolean).join(' ');
  const comparisonCriteria = [
    `용도 적합성: 내가 쓰려는 상황에 ${category}의 기능이 꼭 필요한지 먼저 정리합니다.`,
    `규격·구성: 같은 ${category}끼리 크기·용량·구성품을 같은 기준으로 비교합니다.`,
    ...features.slice(0, 4).map(feature => `특징 확인: "${feature}" 항목이 내 필요와 맞는지 상세 정보에서 확인합니다.`),
    '가격 기준: 표시 가격과 배송비를 합친 실제 결제 금액으로 비교합니다.',
    '교환·반품: 판매처의 교환·반품 조건과 기간을 확인합니다.',
  ];
  const checklist = [
    '필요한 용도와 사용 빈도를 정리했나요?',
    '상품 상세의 규격·구성품을 확인했나요?',
    '구매 시점의 가격과 배송비를 다시 확인했나요?',
    '교환·반품 조건을 확인했나요?',
    ...(product.saleType === 'direct' ? ['에코디몰 상품 페이지에서 재고 상태를 확인했나요?'] : []),
  ];
  const faq = [
    { q:keywords.questions[0], a:`용도, 규격·구성, 실제 결제 금액, 교환·반품 조건을 순서대로 비교하면 됩니다.` },
    { q:`${name}의 주요 특징은 무엇인가요?`, a:features.length ? `판매 정보에 등록된 특징은 ${features.join(', ')}입니다.` : '판매 정보에 등록된 세부 특징이 아직 없습니다. 상품 페이지의 상세 정보를 확인해 주세요.' },
    ...(priceKrw ? [{ q:`${name} 가격은 얼마인가요?`, a:`${updatedAt} 기준 등록 가격은 ${won(priceKrw)}입니다. 가격은 판매처 사정에 따라 바뀔 수 있습니다.` }] : []),
    ...(audience ? [{ q:`${josa(name, '은', '는')} 누구에게 맞나요?`, a:`판매 정보상 대상은 ${audience}입니다.` }] : []),
    { q:`${josa(name, '은', '는')} 어디에서 구매할 수 있나요?`, a:whereToBuy(product) },
  ];
  const sources = unique([product.url, ...product.sources]);
  const title = `${category} 고르는 법: ${name} 확인 포인트`;
  const body = [
    `# ${title}`,
    '',
    `## 한눈에 보는 답`,
    summary,
    '',
    `## 비교 기준`,
    ...comparisonCriteria.map(item => `- ${item}`),
    '',
    `## 구매 전 체크리스트`,
    ...checklist.map(item => `- [ ] ${item}`),
    '',
    `## 자주 묻는 질문`,
    ...faq.flatMap(item => [`### ${item.q}`, item.a, '']),
    ...(sources.length ? ['## 출처', ...sources.map(url => `- ${url}`), ''] : []),
    `_최종 업데이트: ${updatedAt}_`,
  ].join('\n');
  return lintClean({ title, summaryAnswer:summary, comparisonCriteria, checklist, faq, updatedAt, sources, body });
}

function lintClean(guide) {
  const strip = value => sanitizeMarketingText(value);
  return Object.freeze({
    ...guide,
    title:strip(guide.title),
    summaryAnswer:strip(guide.summaryAnswer),
    comparisonCriteria:guide.comparisonCriteria.map(strip).filter(Boolean),
    checklist:guide.checklist.map(strip).filter(Boolean),
    faq:guide.faq.map(item => ({ q:strip(item.q), a:strip(item.a) })).filter(item => item.q && item.a),
    body:strip(guide.body),
  });
}

// ---------------------------------------------------------------- 채널 템플릿

function hashtagsFor(product, keywords, extra = []) {
  const raw = [
    product.name, product.category, `${product.category}추천`,
    ...product.features.slice(0, 3).map(featureKeyword),
    ...keywords.related.slice(4, 6),
    product.saleType === 'direct' ? '에코디몰' : '', '에코디', ...extra,
  ];
  return unique(raw.map(tag => String(tag).replace(/[^\p{L}\p{N}_]+/gu, '')).filter(tag => tag.length >= 2 && tag.length <= 30 && !hasIssue(tag))).slice(0, 10);
}

function factLines(product) {
  return [
    ...product.features.slice(0, 5).map(feature => `· ${feature}`),
    product.priceKrw ? `· 등록 가격 ${won(product.priceKrw)} (구매 시점에 달라질 수 있음)` : '',
    product.audience ? `· 이런 분께: ${product.audience}` : '',
  ].filter(Boolean);
}

function reelScript(product, guide, channelName) {
  const hook = `${product.category} 고르기 전에 이것부터 확인하세요.`;
  const scenes = [
    { time:'0-3초', visual:`${product.name} 전체 모습`, text:hook },
    ...product.features.slice(0, 3).map((feature, index) => ({ time:`${3 + index * 4}-${7 + index * 4}초`, visual:`특징 ${index + 1} 클로즈업`, text:feature })),
    ...(product.priceKrw ? [{ time:'마지막 전', visual:'가격 자막', text:`등록 가격 ${won(product.priceKrw)} · 구매 시점 확인` }] : []),
    { time:'마지막', visual:'체크리스트 자막', text:guide.checklist.slice(0, 2).join(' / ') },
  ];
  const caption = `${hook}\n${guide.summaryAnswer}`;
  const body = [
    `[${channelName} 대본]`,
    `훅: ${hook}`,
    ...scenes.map(scene => `- ${scene.time} | ${scene.visual} | ${scene.text}`),
    '',
    `[캡션]`,
    caption,
  ].join('\n');
  return { hook, scenes, caption, body };
}

function templateVariant(key, product, keywords, guide) {
  const disclosure = disclosureFor(product);
  const target = SEO_CHANNEL_TARGETS[key];
  const base = { key, channel:target.channel, format:target.format, disclosure, aiGenerated:false, link:product.url, media:product.imageUrls };
  if (key === 'facebook') {
    const body = [`${product.category} 찾고 계신가요? ${product.name} 정보를 정리했습니다.`, '', guide.summaryAnswer, '', ...factLines(product), '', '구매 전 체크: ' + guide.checklist.slice(0, 3).join(' / ')].join('\n');
    return { ...base, title:product.name, body, hashtags:hashtagsFor(product, keywords) };
  }
  if (key === 'instagram') {
    const slides = [
      `${product.name}`,
      `${product.category} 고를 때 확인할 점`,
      ...(product.audience ? [`이런 분께: ${product.audience}`] : []),
      ...product.features.slice(0, 5).map((feature, index) => `특징 ${index + 1}. ${feature}`),
      ...(product.priceKrw ? [`등록 가격 ${won(product.priceKrw)} · 구매 시점 확인`] : []),
      `체크리스트: ${guide.checklist.slice(0, 2).join(' / ')}`,
      '자세한 정보는 프로필 링크에서 확인하세요.',
    ].slice(0, 10);
    const caption = [`${product.name} | ${product.category} 고르는 법`, '', guide.summaryAnswer].join('\n');
    const body = [caption, '', '[카드뉴스 구성]', ...slides.map((slide, index) => `${index + 1}. ${slide}`)].join('\n');
    return { ...base, title:product.name, body, caption, slides, hashtags:hashtagsFor(product, keywords) };
  }
  if (key === 'instagram_reel' || key === 'facebook_reel') {
    const script = reelScript(product, guide, key === 'instagram_reel' ? '인스타그램 릴스' : '페이스북 릴스');
    return { ...base, title:`${product.name} 30초 요약`, body:script.body, script, hashtags:hashtagsFor(product, keywords, ['릴스']) };
  }
  if (key === 'youtube_short') {
    const script = reelScript(product, guide, '유튜브 쇼츠');
    const title = clean(`${product.name} | ${product.category} 고를 때 확인할 ${guide.checklist.length}가지`, 100);
    const description = [guide.summaryAnswer, '', ...factLines(product)].join('\n');
    const hashtags = hashtagsFor(product, keywords, ['Shorts']);
    const body = [description, '', script.body].join('\n');
    return { ...base, title, body, description, script, hashtags };
  }
  // naver_blog: 긴 글 초안(H2 + FAQ)
  const body = [
    `# ${guide.title}`,
    '',
    `${josa(product.category, '을', '를')} 고를 때 ${product.name}에서 확인할 점을 판매 정보 기준으로 정리했습니다.`,
    '',
    `## ${product.name} 기본 정보`,
    guide.summaryAnswer,
    ...factLines(product).map(line => line.replace(/^· /, '- ')),
    '',
    `## ${product.category} 비교 기준`,
    ...guide.comparisonCriteria.map(item => `- ${item}`),
    '',
    '## 구매 전 체크리스트',
    ...guide.checklist.map(item => `- ${item}`),
    '',
    '## 자주 묻는 질문',
    ...guide.faq.flatMap(item => [`### ${item.q}`, item.a, '']),
    `_최종 업데이트: ${guide.updatedAt}_`,
  ].join('\n');
  return { ...base, title:guide.title, body, hashtags:hashtagsFor(product, keywords) };
}

// 모든 변형: 무결성 정리 → 표시문을 본문 맨 앞에.
function finalizeVariant(variant, { allowNumbers = null } = {}) {
  const strip = value => sanitizeMarketingText(value, { allowNumbers });
  const body = applyDisclosure(strip(variant.body), variant.disclosure);
  const out = { ...variant, title:clean(strip(variant.title), 240), body, hashtags:variant.hashtags.filter(tag => !hasIssue(tag)) };
  if (out.slides) out.slides = out.slides.map(strip).filter(Boolean).slice(0, 10);
  if (out.caption) out.caption = strip(out.caption);
  if (out.description) out.description = strip(out.description);
  if (out.script) out.script = { ...out.script, hook:strip(out.script.hook), caption:strip(out.script.caption), body:strip(out.script.body), scenes:out.script.scenes.map(scene => ({ ...scene, text:strip(scene.text) })).filter(scene => scene.text) };
  return Object.freeze(out);
}

function normalizeChannels(channels) {
  const list = (Array.isArray(channels) && channels.length ? channels : SEO_GENERATION_CHANNELS).map(item => clean(item, 30).toLowerCase());
  const valid = unique(list.filter(item => SEO_GENERATION_CHANNELS.includes(item)));
  if (!valid.length) throw engineError('CHANNELS_REQUIRED');
  return valid;
}

// ---------------------------------------------------------------- 무료 AI 경로

export function resolveFreeAiProvider(env = {}, { router } = {}) {
  if (String(env.MARKETING_AI_GENERATION_ENABLED ?? '').trim() !== 'true') return { ok:false, reason:'MARKETING_AI_GENERATION_DISABLED' };
  const status = (router?.providerStatus || routerProviderStatus)(env) || [];
  for (const id of FREE_AI_PROVIDER_ALLOWLIST) {
    const provider = status.find(item => item?.id === id);
    if (!provider || provider.available !== true || provider.automaticEligible !== true) continue;
    if (!FREE_COST_CLASSES.includes(String(provider.costClass || ''))) continue;
    // 유료 위임 예산 없이 평가 — 유료·미분류 비용등급은 여기서 반드시 거절된다.
    if (!evaluateAiCostEligibility({ costClass:provider.costClass }, {}).eligible) continue;
    return { ok:true, providerId:id, costClass:provider.costClass };
  }
  return { ok:false, reason:'NO_FREE_PROVIDER_AVAILABLE' };
}

export function aiGenerationStatus(env = {}, options = {}) {
  const resolved = resolveFreeAiProvider(env, options);
  return Object.freeze({ aiEnabled:resolved.ok, providerId:resolved.ok ? resolved.providerId : '', reason:resolved.ok ? '' : resolved.reason, freeOnly:true, paidAllowed:false });
}

function aiPrompt(product, keywords, guide, channels) {
  return [
    '너는 한국어 상품 마케팅 카피 편집자다. 아래 [사실]만 사용해 채널별 본문을 다듬어라.',
    '규칙: 사실에 없는 수치·효능·순위·수상·후기·사용경험을 만들지 마라. 1인칭 사용경험("써보니", "제가 사용해")과 "후기", "인생템", "강력 추천합니다", "검색 1위", "상위 노출 보장", "AI 추천 보장", "완치", "100% 효과"를 쓰지 마라.',
    '광고 표시문은 시스템이 붙이니 쓰지 마라. 응답은 JSON 한 개만: {"bodies":{"<channel>":"본문"}}',
    `[사실] ${JSON.stringify({ name:product.name, category:product.category, priceKrw:product.priceKrw, features:product.features, audience:product.audience, saleType:product.saleType })}`,
    `[키워드] ${JSON.stringify(keywords)}`,
    `[요약답변] ${guide.summaryAnswer}`,
    `[채널] ${channels.join(',')}`,
  ].join('\n');
}

function parseAiBodies(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed.bodies === 'object' && !Array.isArray(parsed.bodies) ? parsed.bodies : null;
  } catch { return null; }
}

function allowedNumbers(product, now) {
  const facts = [product.name, product.category, product.audience, ...product.features, product.priceKrw ? String(product.priceKrw) : '', isoDate(now)].join(' ');
  const set = new Set((facts.match(/\d[\d,.]*/g) || []).map(raw => raw.replace(/[,.]+$/, '').replace(/,/g, '')));
  if (product.priceKrw) set.add(String(product.priceKrw));
  for (let i = 0; i <= 30; i += 1) set.add(String(i)); // 대본 시간·순번
  return set;
}

// ---------------------------------------------------------------- 진입점

export async function generateCampaignContent(input, options = {}) {
  const product = normalizeProduct(input);
  const channels = normalizeChannels(options.channels);
  const requestedMode = options.mode === 'ai' ? 'ai' : 'template';
  const keywords = expandKeywords(product, options.signals || {});
  const guide = buildBuyingGuide(product, keywords, { now:options.now });
  const templates = channels.map(key => finalizeVariant(templateVariant(key, product, keywords, guide)));
  const result = { product, keywords, buyingGuide:guide, mode:'template', requestedMode, fallbackReason:'', provider:'', variants:templates };
  if (requestedMode !== 'ai') return Object.freeze(result);

  const resolved = resolveFreeAiProvider(options.env || {}, { router:options.router });
  if (!resolved.ok) return Object.freeze({ ...result, fallbackReason:resolved.reason });
  try {
    const invoke = options.router?.invokeProviderWithMeta || routerInvoke;
    const task = { id:`marketing-seo-${Date.now().toString(36)}`, title:'marketing-seo-copy' };
    const reply = await invoke(options.env, resolved.providerId, aiPrompt(product, keywords, guide, channels), task, 'marketing-copy');
    const bodies = parseAiBodies(reply?.text ?? reply);
    if (!bodies) return Object.freeze({ ...result, fallbackReason:'AI_RESPONSE_UNPARSEABLE', provider:resolved.providerId });
    const allow = allowedNumbers(product, options.now);
    let used = 0;
    const variants = templates.map(template => {
      const aiBody = clean(bodies[template.key], 8000) ? String(bodies[template.key]).slice(0, 8000) : '';
      if (!aiBody) return template;
      // 무결성·수치 검사 뒤 남은 AI 본문이 너무 짧으면(대부분 제거됨) 템플릿을 유지한다.
      if (sanitizeMarketingText(aiBody, { allowNumbers:allow }).length < 40) return template;
      const candidate = finalizeVariant({ ...template, body:aiBody, aiGenerated:true }, { allowNumbers:allow });
      if (hasIssue(candidate.body)) return template;
      used += 1;
      return candidate;
    });
    if (!used) return Object.freeze({ ...result, fallbackReason:'AI_OUTPUT_REJECTED', provider:resolved.providerId });
    return Object.freeze({ ...result, mode:'ai', provider:resolved.providerId, variants });
  } catch (error) {
    return Object.freeze({ ...result, fallbackReason:`AI_FAILED:${clean(error?.message || error, 80)}`, provider:resolved.providerId });
  }
}
