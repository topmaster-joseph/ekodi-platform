// EKODI store promotion engine — weekly local-search content for CMPMYI stores.
//
// Deterministic Korean templates (cost 0, no network). Every sentence is built only from
// verified store facts passed in by the caller (name, address, phone, displayed hours,
// registered menu names/prices, canonical page). It never invents prices, discounts,
// reviews, rankings or health claims, and every output passes the shared integrity lint
// (marketing-seo-engine.js) so a fact that slips through is removed rather than published.
//
// Search optimisation per channel:
//  - SEO  : primary local keyword in the blog title and first sentence, H2 structure,
//           canonical link back to ekodi.kr/<store> (the page that carries Restaurant JSON-LD).
//  - AEO  : question-form headings with a direct 1–2 sentence answer right below each one.
//  - GEO  : a short "핵심 정보" block of self-contained, citable fact sentences
//           (who / where / when / how to order) that generative search can quote verbatim.
//  - SNS  : short copy, one fact, one call to action, local hashtags.
import { lintMarketingText, sanitizeMarketingText } from './marketing-seo-engine.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const STORE_PROMO_STORES = Object.freeze({
  jadam: Object.freeze({
    subjectKey:'jadam', name:'자담치킨 목포대점', brand:'자담치킨', category:'치킨', menuNoun:'치킨',
    canonical:'https://ekodi.kr/jadam',
    keywords:Object.freeze(['목포대 치킨','목포대 후문 치킨','무안 청계 치킨','자담치킨 목포대점']),
    hashtags:Object.freeze(['목포대','목포대후문','무안청계','목포대치킨','자담치킨','자담치킨목포대점']),
  }),
  pizzamaru: Object.freeze({
    subjectKey:'pizzamaru', name:'피자마루 목포대점', brand:'피자마루', category:'피자', menuNoun:'피자',
    canonical:'https://ekodi.kr/pizzamaru',
    keywords:Object.freeze(['목포대 피자','목포대 후문 피자','무안 청계 피자','피자마루 목포대점']),
    hashtags:Object.freeze(['목포대','목포대후문','무안청계','목포대피자','피자마루','피자마루목포대점']),
  }),
  yogurt: Object.freeze({
    subjectKey:'yogurt', name:'요거트퍼플 목포대점', brand:'요거트퍼플', category:'요거트 디저트', menuNoun:'디저트',
    canonical:'https://ekodi.kr/yogurt',
    keywords:Object.freeze(['목포대 디저트','목포대 후문 요거트','무안 청계 디저트','요거트퍼플 목포대점']),
    hashtags:Object.freeze(['목포대','목포대후문','무안청계','목포대디저트','요거트퍼플','요거트퍼플목포대점']),
  }),
});

// Theme pool. Each theme only needs facts every store has (hours, location, phone, page);
// 'menu' is used only when at least one registered menu name exists.
export const STORE_PROMO_THEMES = Object.freeze(['lunch','evening','location','order','menu','group']);
export const SNS_CHANNELS = Object.freeze(['instagram','facebook','threads']);

const clean = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const won = n => `${Math.round(n).toLocaleString('ko-KR')}원`;
// Korean particle by final consonant of the last Hangul syllable (을/를, 은/는, 이/가).
export function josa(word, withFinal, withoutFinal) {
  const text = String(word ?? '').trim();
  const code = text.charCodeAt(text.length - 1) - 0xAC00;
  if (!(code >= 0 && code <= 11171)) return `${text}${withFinal}(${withoutFinal})`;
  return `${text}${code % 28 ? withFinal : withoutFinal}`;
}

export function isoWeekKey(date = new Date()) {
  const kst = new Date(new Date(date).getTime() + KST_OFFSET_MS);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Monday 00:00 KST of the ISO week, as a UTC Date.
export function weekStartUtc(weekKey) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ''));
  if (!m) return null;
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (Number(m[2]) - 1) * 7 * 86400000);
  return new Date(monday.getTime() - KST_OFFSET_MS);
}

// Three posts a week, published Tue 11:30 / Thu 17:30 / Sat 11:30 KST (inside the 08–22 window).
export const WEEKLY_SLOTS = Object.freeze([
  Object.freeze({ dayOffset:1, hour:11, minute:30 }),
  Object.freeze({ dayOffset:3, hour:17, minute:30 }),
  Object.freeze({ dayOffset:5, hour:11, minute:30 }),
]);
export function slotTime(weekKey, index) {
  const start = weekStartUtc(weekKey);
  const slot = WEEKLY_SLOTS[index % WEEKLY_SLOTS.length];
  if (!start || !slot) return null;
  return new Date(start.getTime() + slot.dayOffset * 86400000 + (slot.hour * 60 + slot.minute) * 60000).toISOString();
}

export function normalizeFacts(store, input = {}) {
  const hours = clean(input.hours?.display ?? input.hours, 40);
  const menu = (Array.isArray(input.menu) ? input.menu : [])
    .map(item => ({ name:clean(item?.name, 60), priceKrw:Number.isSafeInteger(Number(item?.priceKrw ?? item?.price)) && Number(item?.priceKrw ?? item?.price) > 0 ? Number(item?.priceKrw ?? item?.price) : null }))
    .filter(item => item.name && !lintMarketingText(item.name).length)
    .slice(0, 12);
  return Object.freeze({
    name:store.name, brand:store.brand, category:store.category, menuNoun:store.menuNoun, canonical:store.canonical,
    address:clean(input.address, 120), phone:clean(input.phone, 20), hours,
    menu:Object.freeze(menu),
  });
}

export function themesForWeek(weekKey, facts) {
  const m = /W(\d{2})$/.exec(weekKey || ''); const n = m ? Number(m[1]) : 0;
  const pool = STORE_PROMO_THEMES.filter(theme => theme !== 'menu' || facts.menu.length);
  return [0, 1, 2].map(i => pool[(n * 3 + i) % pool.length]);
}

function menuLine(facts, weekKey) {
  if (!facts.menu.length) return '';
  const m = /W(\d{2})$/.exec(weekKey || ''); const start = m ? Number(m[1]) % facts.menu.length : 0;
  const picks = [0, 1, 2].map(i => facts.menu[(start + i) % facts.menu.length]).filter((v, i, a) => a.indexOf(v) === i);
  return picks.map(item => item.priceKrw ? `${item.name}(${won(item.priceKrw)})` : item.name).join(', ');
}

function snsCopy(theme, facts, weekKey) {
  const where = '국립목포대학교 후문';
  const hoursText = facts.hours ? `${facts.hours} 영업` : '영업시간은 전화로 확인';
  const lines = {
    lunch:[`${where} ${facts.name}, 점심에도 ${facts.menuNoun} 주문할 수 있어요.`, `${hoursText} · 문의 ${facts.phone}`],
    evening:[`과제 끝난 저녁, ${where} ${facts.name}에서 ${facts.menuNoun} 어떠세요?`, `${hoursText} · 마감 직전 주문은 전화로 먼저 확인해 주세요.`],
    location:[`${facts.name}은 ${where}에 있어요.`, facts.address ? `주소: ${facts.address}` : '', `길찾기·메뉴는 공식 페이지에서 확인하세요.`],
    order:[`${facts.name} 주문은 전화 ${facts.phone} 또는 공식 페이지에 연결된 배달앱 경로로 할 수 있어요.`, '배달비·쿠폰은 각 주문 채널에서 확인해 주세요.'],
    menu:[`이번 주 ${facts.name} 추천 메뉴: ${menuLine(facts, weekKey)}.`, '실시간 판매 여부와 가격은 주문 전에 확인해 주세요.'],
    group:[`동아리·스터디 모임 메뉴 고민될 때, ${where} ${facts.name}.`, `여러 명 주문은 ${facts.phone}로 미리 문의하면 편해요.`],
  }[theme] || [];
  return lines.filter(Boolean).concat([`👉 ${facts.canonical}`]).join('\n');
}

const THEME_TITLES = Object.freeze({
  lunch:'점심 주문 안내', evening:'저녁·야식 주문 안내', location:'위치·찾아오는 길', order:'주문 방법 안내', menu:'이번 주 추천 메뉴', group:'모임 주문 안내',
});

// SEO + AEO + GEO long-form for Naver Blog (no official write API → copy & publish by hand).
export function naverBlogDraft(store, facts, weekKey) {
  const kw = store.keywords[0];
  const title = `${kw} | ${facts.name} 메뉴·영업시간·주문 방법 (${weekKey.replace('-W', '년 ')}주차)`;
  const hours = facts.hours || '전화 확인';
  const menu = menuLine(facts, weekKey);
  const sections = [
    `${josa(kw,'을','를')} 찾는다면 ${josa(facts.name,'을','를')} 확인해 보세요. ${josa(facts.name,'은','는')} 국립목포대학교 후문에 있는 ${facts.brand} 매장입니다.`,
    '',
    '■ 핵심 정보',
    `- 매장: ${facts.name} (${facts.brand})`,
    facts.address ? `- 주소: ${facts.address} (국립목포대학교 후문)` : '- 위치: 국립목포대학교 후문',
    `- 안내 영업시간: ${hours} (휴무·마감은 전화 확인)`,
    facts.phone ? `- 전화 주문·문의: ${facts.phone}` : '',
    `- 공식 페이지: ${facts.canonical}`,
    '',
    `## ${facts.name}은 어디에 있나요?`,
    facts.address ? `${facts.address}에 있으며, 국립목포대학교 후문 인근입니다. 길찾기는 공식 페이지의 지도 링크를 이용하세요.` : '국립목포대학교 후문 인근에 있습니다. 길찾기는 공식 페이지에서 확인하세요.',
    '',
    `## ${facts.name} 영업시간은 언제인가요?`,
    `안내 영업시간은 ${hours}입니다. 임시 휴무나 주문 마감은 달라질 수 있으니 방문·주문 전에 전화로 확인해 주세요.`,
    '',
    `## ${facts.name}은 어떻게 주문하나요?`,
    `${facts.phone ? `전화(${facts.phone})로 주문하거나, ` : ''}공식 페이지(${facts.canonical})에 연결된 배달앱 경로를 이용할 수 있습니다. 배달비와 쿠폰은 각 주문 채널에서 확인하세요.`,
    '',
    menu ? `## ${facts.name} 메뉴는 무엇이 있나요?` : '',
    menu ? `등록된 메뉴로는 ${menu} 등이 있습니다. 전체 메뉴와 가격, 실시간 판매 여부는 공식 페이지와 주문 채널에서 확인하세요.` : '',
    '',
    `#${store.keywords.map(k => k.replace(/\s+/g, '')).join(' #')}`,
  ];
  const body = sanitizeMarketingText(sections.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n'));
  return { channel:'naver_blog', format:'blog_draft', title:clean(title, 200), body, hashtags:store.keywords.map(k => k.replace(/\s+/g, '')) };
}

export function buildStorePromoWeek(storeKey, factsInput = {}, { weekKey = isoWeekKey() } = {}) {
  const store = STORE_PROMO_STORES[storeKey];
  if (!store) throw Object.assign(new Error('STORE_PROMO_UNKNOWN_STORE'), { code:'STORE_PROMO_UNKNOWN_STORE' });
  const facts = normalizeFacts(store, factsInput);
  const themes = themesForWeek(weekKey, facts);
  const posts = themes.map((theme, index) => {
    const body = sanitizeMarketingText(snsCopy(theme, facts, weekKey));
    const title = `${facts.name} · ${THEME_TITLES[theme]}`;
    return Object.freeze({
      key:`${weekKey}:${theme}`, theme, title, scheduledAt:slotTime(weekKey, index),
      variants:Object.freeze(SNS_CHANNELS.map(channel => Object.freeze({ channel, format:'feed', title, body, hashtags:store.hashtags }))),
    });
  });
  posts.push(Object.freeze({
    key:`${weekKey}:blog`, theme:'blog', title:`${facts.name} · 검색용 블로그 글`, scheduledAt:null,
    variants:Object.freeze([Object.freeze(naverBlogDraft(store, facts, weekKey))]),
  }));
  return Object.freeze({ storeKey, subjectKey:store.subjectKey, weekKey, facts, posts:Object.freeze(posts) });
}
