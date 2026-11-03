// Renders the KakaoTalk / Open Graph share cards for 오늘의 매일묵상 (1200x630 JPEG).
// Cards carry only the public common-scripture list (date, title, passage) — never the
// day's poem, song or questions, which stay closed until the day itself.
//
//   node scripts/render-devotion-cards.mjs [--month 2026-12] [--font-dir <dir with gowun-batang-korean-*.woff2>]
//
// Writes bible/og/<YYYY-MM-DD>.jpg, bible/og/devotion.jpg and bible/og/manifest.json.
// Requires Playwright with Chromium (dev tool, not part of the production bundle).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { registeredCommonScriptureMonths, commonScriptureSnapshot } from '../common-scripture-registry.js';
import { activityRegistrySnapshot } from '../devotional-activities.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'bible', 'og');
const args = process.argv.slice(2);
const argValue = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
const onlyMonth = argValue('--month');
const fontDir = argValue('--font-dir');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const WEEKDAY = ['주일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fontFace = fontDir ? ['400', '700'].map(weight => {
  const file = path.join(fontDir, `gowun-batang-korean-${weight}-normal.woff2`);
  return fs.existsSync(file) ? `@font-face{font-family:'Gowun Batang';font-weight:${weight};src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format('woff2')}` : '';
}).join('') : '';

function cardHtml({ eyebrow, dateLine, title, passage }) {
  const titleSize = title.length > 18 ? 64 : title.length > 12 ? 74 : 84;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${fontFace}
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;overflow:hidden;font-family:'Gowun Batang','Noto Serif CJK KR',serif;color:#f4f0e5;
    background:radial-gradient(circle at 82% 30%,rgba(236,222,174,.20) 0 9%,transparent 30%),linear-gradient(118deg,#0e2924 0%,#173d33 52%,#4f7564 100%)}
  .ring{position:absolute;border:1.5px solid rgba(244,240,229,.12);border-radius:50%}
  .r1{width:640px;height:640px;right:-150px;top:-40px}.r2{width:470px;height:470px;right:-65px;top:45px}.r3{width:300px;height:300px;right:20px;top:130px}
  .sun{position:absolute;width:118px;height:118px;border-radius:50%;right:121px;top:231px;background:#e9d4a1;box-shadow:0 0 90px rgba(249,228,170,.55)}
  .wrap{position:absolute;inset:0;padding:68px 80px;display:flex;flex-direction:column}
  .eyebrow{font-family:'Noto Sans CJK KR',sans-serif;font-size:22px;letter-spacing:.32em;font-weight:500;color:#d8bd81}
  .date{margin-top:20px;font-family:'Noto Sans CJK KR',sans-serif;font-size:30px;font-weight:300;color:rgba(244,240,229,.86)}
  h1{margin-top:auto;max-width:760px;font-size:${titleSize}px;line-height:1.22;font-weight:700;word-break:keep-all;text-shadow:0 2px 24px rgba(0,0,0,.18)}
  .passage{margin-top:26px;display:flex;align-items:center;gap:18px;font-size:34px;color:#f4f0e5}
  .passage:before{content:"";width:56px;height:2px;background:#d8bd81}
  .foot{position:absolute;right:80px;bottom:56px;font-family:'Noto Sans CJK KR',sans-serif;font-size:22px;letter-spacing:.12em;color:rgba(244,240,229,.62)}
  </style></head><body><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="sun"></div>
  <div class="wrap"><div class="eyebrow">${esc(eyebrow)}</div><div class="date">${esc(dateLine)}</div><h1>${esc(title)}</h1>${passage ? `<div class="passage">${esc(passage)}</div>` : ''}</div>
  <div class="foot">EKODI · ekodi.kr</div></body></html>`;
}

function dayCards(month) {
  const registry = commonScriptureSnapshot(month);
  const activities = activityRegistrySnapshot(month);
  return registry.readings.map(reading => {
    const [y, m, d] = reading.date.split('-').map(Number);
    const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const title = (Array.isArray(registry.titles) && registry.titles[reading.day - 1])
      || activities?.days?.find(item => item.day === reading.day && item.passage === reading.passage)?.theme
      || '오늘의 공통본문';
    return { file: `${reading.date}.jpg`, eyebrow: '오늘의 매일묵상', dateLine: `${y}년 ${m}월 ${d}일 ${weekday}`, title, passage: reading.passage };
  });
}

fs.mkdirSync(outDir, { recursive: true });
const months = registeredCommonScriptureMonths().filter(month => !onlyMonth || month === onlyMonth);
const cards = [{ file: 'devotion.jpg', eyebrow: 'EKODI DAILY DEVOTION', dateLine: '에코디교회 · 에코디선교회 · 말씀대화', title: '오늘의 매일묵상', passage: '말씀을 읽고, 노래하고, 묻고, 살아봅니다' }];
for (const month of months) cards.push(...dayCards(month));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const card of cards) {
  await page.setContent(cardHtml(card), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, card.file), type: 'jpeg', quality: 84 });
}
await browser.close();

const manifestPath = path.join(outDir, 'manifest.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).months || [] : [];
const manifest = { schema: 'ekodi.devotion-cards.v1', size: '1200x630', generic: 'devotion.jpg', months: [...new Set([...previous, ...months])].sort() };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Rendered ${cards.length} cards for ${months.join(', ') || '(generic only)'}`);
