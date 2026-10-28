#!/usr/bin/env node
// BOOKS-PUBLISHING-CHROME-001
// 출판(ekodi.kr/publishing)과 에코디서점(ekodi.kr/books)의 머리말(header)·꼬리말(footer)을 한곳에서 정의한다.
// 두 사이트는 같은 구조(생태계 띠 → 마스트헤드 → 본문 → 4단 꼬리말)를 쓰고, 성격(독자 / 저자)에 맞는 메뉴·색·문구만 다르다.
//   node scripts/site-chrome.mjs          모든 페이지에 반영(페이지별 머리말·꼬리말 교체)
//   node scripts/site-chrome.mjs --check  반영이 어긋난 페이지가 있으면 실패(테스트·CI용)
// 링크는 모두 정식 주소(https://ekodi.kr/…)로 써서 게이트웨이 경로 재작성과 무관하게 같은 곳을 가리킨다.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://ekodi.kr';
const YEAR = '2026';

const NETWORK = [
  { id: 'publishing', label: '출판', note: '책을 만들다', href: `${ORIGIN}/publishing/` },
  { id: 'books', label: '에코디서점', note: '책을 만나다', href: `${ORIGIN}/books/` },
  { id: 'mall', label: '에코디몰 책·배움', note: '함께 나누다', href: `${ORIGIN}/ekodimall/?category=book` },
];

export const SITES = {
  books: {
    mark: 'ES',
    name: '에코디서점',
    tagline: 'Faith · Scholarship · Community',
    home: `${ORIGIN}/books/`,
    nav: [
      ['도서', `${ORIGIN}/books/#catalog`],
      ['시리즈', `${ORIGIN}/books/series/`],
      ['리서치', `${ORIGIN}/books/research/`],
      ['노트', `${ORIGIN}/books/notes/`],
      ['소개', `${ORIGIN}/books/#about`],
    ],
    cta: ['내 서재', `${ORIGIN}/books/library/`],
    about: '현장을 기록하고, 다시 인용될 수 있는 지식으로. 에코디서점은 신앙·학문·공동체의 언어를 독자에게 정직하게 전하는 서점입니다.',
    footMenu: [
      ['도서 목록', `${ORIGIN}/books/#catalog`],
      ['시리즈', `${ORIGIN}/books/series/`],
      ['리서치', `${ORIGIN}/books/research/`],
      ['노트', `${ORIGIN}/books/notes/`],
      ['내 서재', `${ORIGIN}/books/library/`],
    ],
    infoTitle: '판매자 정보',
    info: [
      '상호 에코디비즈 · 대표 정찬균',
      '사업자등록번호 213-13-01959',
      '통신판매업 2023-전남무안-0153',
      '전남 무안군 청계면 백련동1길 17-4',
      '문의 ekodibiz@gmail.com',
    ],
    pages: [
      'books/index.html', 'books/series/index.html', 'books/research/index.html', 'books/notes/index.html',
      'books/ekodian/index.html', 'books/buy/index.html', 'books/buy/success/index.html', 'books/buy/fail/index.html',
      'books/library/index.html', 'books/store/index.html',
    ],
    assetDir: 'books',
  },
  publishing: {
    mark: 'EP',
    name: '출판',
    tagline: 'Publishing · Production · Distribution',
    home: `${ORIGIN}/publishing/`,
    nav: [
      ['출판 상담', `${ORIGIN}/publishing/consultation/`],
      ['제작·대행', `${ORIGIN}/publishing/production/`],
      ['유통', `${ORIGIN}/publishing/distribution/`],
      ['스튜디오', `${ORIGIN}/publishing/studio/`],
      ['UPaper 등록', `${ORIGIN}/publishing/upaper/`],
    ],
    cta: ['출판 상담 신청', `${ORIGIN}/publishing/consultation/`],
    about: '원고 상담부터 편집·전자책 제작·서지 등록·유통까지. 저자의 책이 독자에게 닿는 전 과정을 함께 설계하는 EKODI 출판 서비스입니다.',
    footMenu: [
      ['출판 상담', `${ORIGIN}/publishing/consultation/`],
      ['제작·대행', `${ORIGIN}/publishing/production/`],
      ['유통', `${ORIGIN}/publishing/distribution/`],
      ['출판 스튜디오', `${ORIGIN}/publishing/studio/`],
      ['저자 작업공간', `${ORIGIN}/books/publishing/workspace/`],
    ],
    infoTitle: '운영 정보',
    info: [
      '운영 에코디비즈 · 대표 정찬균',
      '사업자등록번호 213-13-01959',
      '전남 무안군 청계면 백련동1길 17-4',
      '출판 문의 ekodibiz@gmail.com',
    ],
    pages: [
      'publishing/index.html', 'publishing/consultation/index.html', 'publishing/production/index.html',
      'publishing/distribution/index.html', 'publishing/studio/index.html', 'publishing/upaper/index.html', 'publishing/human/index.html',
      'books/publishing/workspace/index.html',
    ],
    assetDir: 'publishing',
  },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function header(siteId, slot = '') {
  const s = SITES[siteId];
  const net = NETWORK.map(n => `<a href="${n.href}"${n.id === siteId ? ' aria-current="true"' : ''}><b>${esc(n.label)}</b><span>${esc(n.note)}</span></a>`).join('');
  const nav = s.nav.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join('');
  return `<header class="ekc-header" data-ekodi-chrome="${siteId}">`
    + `<div class="ekc-network"><div class="ekc-shell"><span class="ekc-network-label">EKODI 출판 생태계</span><nav class="ekc-network-links" aria-label="출판 생태계">${net}</nav></div></div>`
    + `<div class="ekc-shell ekc-masthead">`
    + `<a class="ekc-brand" href="${s.home}" aria-label="${esc(s.name)} 홈"><span class="ekc-mark" aria-hidden="true">${s.mark}</span><span class="ekc-brand-copy"><b>${esc(s.name)}</b><small>${esc(s.tagline)}</small></span></a>`
    + `<div class="ekc-actions">${slot}<a class="ekc-cta" href="${s.cta[1]}">${esc(s.cta[0])}</a><button class="menu-button ekc-menu" type="button" aria-expanded="false" aria-controls="site-nav">MENU</button></div>`
    + `<nav id="site-nav" class="ekc-nav" aria-label="${esc(s.name)} 메뉴">${nav}<a class="ekc-nav-cta" href="${s.cta[1]}">${esc(s.cta[0])}</a></nav>`
    + `</div></header>`;
}

export function footer(siteId) {
  const s = SITES[siteId];
  const list = items => `<ul>${items.map(([t, h]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('')}</ul>`;
  const network = NETWORK.map(n => [n.label, n.href]).concat([['EKODI', `${ORIGIN}/`]]);
  return `<footer class="ekc-footer" data-ekodi-chrome="${siteId}"><div class="ekc-shell">`
    + `<div class="ekc-foot-grid">`
    + `<section class="ekc-foot-brand"><p class="ekc-foot-name"><span class="ekc-mark" aria-hidden="true">${s.mark}</span><b>${esc(s.name)}</b></p><p>${esc(s.about)}</p><div class="ekc-social" data-ekodi-social-links data-org="${siteId}" data-variant="plain"></div></section>`
    + `<section><h2>${esc(s.name)}</h2>${list(s.footMenu)}</section>`
    + `<section><h2>출판 생태계</h2>${list(network)}</section>`
    + `<section><h2>${esc(s.infoTitle)}</h2><ul class="ekc-info">${s.info.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`
    + `</div>`
    + `<div class="ekc-foot-base"><p>© <span id="year">${YEAR}</span> ${esc(s.name)} · EKODI</p><p><a href="${ORIGIN}/privacy">개인정보처리방침</a><a href="${ORIGIN}/terms">이용약관</a></p></div>`
    + `</div></footer>`;
}

// 두 사이트가 공유하는 레이아웃. 사이트 성격은 맨 위 토큰(--ekc-*)으로만 달라진다.
export function css(siteId) {
  const theme = siteId === 'books'
    ? '--ekc-paper:#f6f2e8;--ekc-ink:#152033;--ekc-accent:#10264f;--ekc-accent-2:#8a2e2e;--ekc-line:#cec6b7;--ekc-band:#10264f;--ekc-foot:#0f1a2c;--ekc-foot-ink:#e8e4db;--ekc-foot-muted:#aab3c0;--ekc-foot-line:#2d3a52'
    : '--ekc-paper:#f7f3ec;--ekc-ink:#1c1716;--ekc-accent:#7a2a2a;--ekc-accent-2:#10264f;--ekc-line:#d4c8bb;--ekc-band:#3a1a1a;--ekc-foot:#1f1513;--ekc-foot-ink:#efe6dc;--ekc-foot-muted:#bfae9f;--ekc-foot-line:#46302b';
  return `/* BOOKS-PUBLISHING-CHROME-001 — scripts/site-chrome.mjs가 생성합니다. 직접 고치지 말고 스크립트를 고친 뒤 다시 생성하세요. */
.ekc-header,.ekc-footer{${theme};--ekc-max:1260px;box-sizing:border-box;width:auto;height:auto;min-height:0;max-width:none;margin:0;font-family:"Noto Serif KR","Nanum Myeongjo",Georgia,serif;text-align:left}
.ekc-header *,.ekc-footer *{box-sizing:border-box}
.ekc-shell{width:min(calc(100% - 44px),var(--ekc-max));margin:0 auto}
.ekc-header{display:block;position:sticky;top:0;z-index:40;padding:0;background:var(--ekc-paper);color:var(--ekc-ink);border-bottom:2px solid var(--ekc-accent);box-shadow:0 1px 0 rgba(0,0,0,.02)}
.ekc-network{background:var(--ekc-band);color:#f3efe6;font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.ekc-network .ekc-shell{display:flex;align-items:center;gap:18px;min-height:32px}
.ekc-network-label{font-size:.62rem;letter-spacing:.14em;opacity:.72;white-space:nowrap}
.ekc-network-links{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.ekc-network-links::-webkit-scrollbar{display:none}
.ekc-network-links a{display:inline-flex;align-items:baseline;gap:6px;padding:6px 10px;color:inherit;text-decoration:none;font-size:.72rem;white-space:nowrap;border-radius:2px;opacity:.82}
.ekc-network-links a span{font-size:.62rem;opacity:.7}
.ekc-network-links a:hover{opacity:1;background:rgba(255,255,255,.08)}
.ekc-network-links a[aria-current]{opacity:1;background:rgba(255,255,255,.14);box-shadow:inset 0 -2px 0 #d9b56a}
.ekc-masthead{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px;min-height:72px}
.ekc-brand{display:inline-flex;align-items:center;gap:13px;color:inherit;text-decoration:none}
.ekc-mark{display:inline-grid;place-items:center;width:38px;height:44px;border:2px solid var(--ekc-accent);color:var(--ekc-accent);font-family:Georgia,serif;font-weight:700;font-size:.84rem;clip-path:polygon(50% 0,100% 12%,100% 78%,50% 100%,0 78%,0 12%);flex:none}
.ekc-brand-copy b,.ekc-brand-copy small{display:block}
.ekc-brand-copy b{font-size:1.05rem;letter-spacing:.04em;color:var(--ekc-accent)}
.ekc-brand-copy small{margin-top:2px;font-family:Georgia,serif;font-size:.66rem;color:#5d6472}
.ekc-nav{grid-column:2;grid-row:1;display:flex;justify-content:flex-end;align-items:center;gap:26px}
.ekc-nav a{color:var(--ekc-ink);text-decoration:none;font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:.8rem;letter-spacing:.02em;padding:6px 0;border-bottom:1px solid transparent}
.ekc-nav a:hover,.ekc-nav a[aria-current="page"]{color:var(--ekc-accent-2);border-bottom-color:currentColor}
.ekc-nav .ekc-nav-cta{display:none}
.ekc-actions{grid-column:3;display:flex;align-items:center;gap:10px}
.ekc-cta{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;background:var(--ekc-accent);color:#fffdf8;text-decoration:none;font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:.78rem;letter-spacing:.03em;border:1px solid var(--ekc-accent)}
.ekc-cta:hover{background:transparent;color:var(--ekc-accent)}
.ekc-header .ekc-menu{display:none;min-height:38px;border-radius:0;box-shadow:none;font-weight:400;padding:0 13px;border:1px solid var(--ekc-accent);background:transparent;color:var(--ekc-accent);font-family:Arial,sans-serif;font-size:.68rem;letter-spacing:.1em;cursor:pointer}
.ekc-footer{display:block;padding:54px 0 26px;margin-top:0;background:var(--ekc-foot);color:var(--ekc-foot-ink);border-top:3px solid var(--ekc-accent)}
.ekc-foot-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1.3fr;gap:36px}
.ekc-foot-name{display:flex;align-items:center;gap:12px;margin:0 0 14px}
.ekc-foot-name b{font-size:1.1rem;letter-spacing:.04em}
.ekc-footer .ekc-mark{border-color:var(--ekc-foot-ink);color:var(--ekc-foot-ink)}
.ekc-footer p{margin:0;color:var(--ekc-foot-muted);font-size:.8rem;line-height:1.75}
.ekc-footer h2{margin:0 0 12px;font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:.66rem;font-weight:700;letter-spacing:.14em;color:#d9b56a}
.ekc-footer ul{list-style:none;margin:0;padding:0}
.ekc-footer li{margin:0 0 7px;font-size:.8rem;color:var(--ekc-foot-muted)}
.ekc-footer a{color:var(--ekc-foot-ink);text-decoration:none;font-family:inherit;font-size:.8rem}
.ekc-footer a:hover{text-decoration:underline;text-underline-offset:4px}
.ekc-social{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:16px}
.ekc-social:empty{display:none}
.ekc-social a{font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:.74rem;opacity:.9}
.ekc-info li{font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:.74rem}
.ekc-foot-base{display:flex;justify-content:space-between;gap:20px;margin-top:40px;padding-top:18px;border-top:1px solid var(--ekc-foot-line)}
.ekc-foot-base p{font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:.72rem}
.ekc-foot-base a{margin-left:16px;font-size:.72rem}
@media(max-width:980px){
.ekc-masthead{grid-template-columns:1fr auto;min-height:64px;gap:14px}
.ekc-header .ekc-menu{display:inline-block}
.ekc-cta{display:none}
.ekc-nav{display:none;position:absolute;top:100%;left:-22px;right:-22px;grid-column:auto;flex-direction:column;align-items:stretch;gap:0;padding:6px 22px 14px;background:var(--ekc-paper);border-bottom:2px solid var(--ekc-accent);box-shadow:0 14px 28px rgba(16,26,44,.14)}
.ekc-nav.open{display:flex}
.ekc-nav a{padding:13px 0;font-size:.9rem;border-bottom:1px solid var(--ekc-line)}
.ekc-nav .ekc-nav-cta,.ekc-nav .ekc-nav-cta[aria-current]{display:block;margin-top:10px;text-align:center;background:var(--ekc-accent);color:#fffdf8;border:0}
.ekc-actions{grid-column:2}
.ekc-foot-grid{grid-template-columns:1fr 1fr;gap:30px}
.ekc-foot-brand{grid-column:1/-1}
}
@media(max-width:640px){
.ekc-shell{width:min(calc(100% - 26px),var(--ekc-max))}
.ekc-nav{left:-13px;right:-13px;padding-left:13px;padding-right:13px}
.ekc-network-label{display:none}
.ekc-network-links a span{display:none}
.ekc-brand-copy small{display:none}
.ekc-foot-grid{grid-template-columns:1fr}
.ekc-foot-base{flex-direction:column}
.ekc-foot-base a{margin:0 16px 0 0}
}
`;
}

export const MENU_JS = `// BOOKS-PUBLISHING-CHROME-001 — scripts/site-chrome.mjs가 생성합니다. 출판·에코디서점 공용 머리말 동작(모바일 메뉴, 현재 위치 표시).
(() => {
  'use strict';
  const button = document.querySelector('.menu-button');
  const nav = document.getElementById('site-nav');
  if (nav) {
    const here = location.pathname.replace(/index\\.html$/, '');
    nav.querySelectorAll('a').forEach(a => { let u = null; try { u = new URL(a.href); } catch {} if (!u || u.hash) return; const p = u.pathname.replace(/^\\/(?:books|publishing)(?=\\/)/, ''); if (p.length > 1 && here.endsWith(p)) a.setAttribute('aria-current', 'page'); });
  }
  if (!button || !nav || button.dataset.menuBound) return;
  button.dataset.menuBound = '1';
  const close = () => { if (!nav.classList.contains('open')) return; nav.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => { const open = nav.classList.toggle('open'); button.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); button.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.ekc-header')) close(); });
})();
`;

// ---- 페이지 반영 ----
const HEADER_RE = /<header\b[\s\S]*?<\/header>/;
const FOOTER_RE = /<footer\b[\s\S]*?<\/footer>/;
const SLOT_RE = /<span\b[^>]*\bid="(?:modeBadge)"[^>]*>[\s\S]*?<\/span>/;

export function applyToPage(html, siteId, rel, cssHref = '/site-chrome.css') {
  let out = html;
  const oldHeader = (out.match(HEADER_RE) || [''])[0];
  const slot = (oldHeader.match(SLOT_RE) || [''])[0];
  const h = header(siteId, slot);
  const f = footer(siteId);
  if (!oldHeader) throw new Error(`${rel}: <header> 없음`);
  out = out.replace(HEADER_RE, h);
  if (FOOTER_RE.test(out)) out = out.replace(FOOTER_RE, f);
  else out = out.replace(/<\/body>/, `${f}\n</body>`);
  // 같은 사이트 안에서 가장 가까운 공용 자원(/site-chrome.css, /menu.js). 저자 작업공간은 서점 워커가 내보내므로 서점 쪽 사본을 쓴다.
  const jsSrc = '/menu.js';
  if (!out.includes(`href="${cssHref}"`)) out = out.replace(/<\/head>/, `<link rel="stylesheet" href="${cssHref}">\n</head>`);
  if (!out.includes(`src="${jsSrc}"`)) out = out.replace(/<\/body>/, `<script src="${jsSrc}" defer></script>\n</body>`);
  return out;
}

function chromeFiles() {
  const files = new Map();
  for (const [id, site] of Object.entries(SITES)) {
    files.set(`${site.assetDir}/site-chrome.css`, css(id));
    files.set(`${site.assetDir}/menu.js`, MENU_JS);
  }
  // 서점 워커가 내보내는 저자 작업공간은 서점 자원 경로를 쓰므로, 출판 색을 별도 파일로 둔다.
  files.set('books/publishing-chrome.css', css('publishing'));
  return files;
}

export function plan() {
  const out = new Map(chromeFiles());
  for (const [id, site] of Object.entries(SITES)) {
    for (const rel of site.pages) {
      const html = readFileSync(join(ROOT, rel), 'utf8');
      out.set(rel, applyToPage(html, id, rel, rel === 'books/publishing/workspace/index.html' ? '/publishing-chrome.css' : '/site-chrome.css'));
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const drift = [];
  for (const [rel, content] of plan()) {
    let current = null; try { current = readFileSync(join(ROOT, rel), 'utf8'); } catch {}
    if (current === content) continue;
    drift.push(rel);
    if (!check) writeFileSync(join(ROOT, rel), content);
  }
  if (check && drift.length) { console.error(`site chrome drift: ${drift.join(', ')}\n→ node scripts/site-chrome.mjs`); process.exit(1); }
  console.log(check ? 'site chrome: in sync' : `site chrome: ${drift.length} file(s) updated`);
}
