import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfPath = path.resolve(fileURLToPath(import.meta.url));

const replacements = new Map([
  ['에코디 비즈니스 OS', '비즈니스 OS'],
  ['EKODI Business OS', 'Business OS'],
  ['EKODI BUSINESS OS', 'BUSINESS OS'],
  ['<span><strong>EKODI</strong><small>BUSINESS OS</small></span>', '<span><strong>BUSINESS OS</strong></span>'],
  ['에코디 경영플랫폼', '경영플랫폼'],
  ['EKODI Management Platform', 'Management Platform'],
  ['EKODI MANAGEMENT PLATFORM', 'MANAGEMENT PLATFORM'],
  ['에코디 쇼핑플랫폼', '쇼핑플랫폼'],
  ['EKODI Shop Platform', 'Shop Platform'],
  ['EKODI SHOP PLATFORM', 'SHOP PLATFORM'],
  ['에코디커뮤니티', '커뮤니티'],
  ['에코디 커뮤니티', '커뮤니티'],
  ['EKODI COMMUNITY', 'COMMUNITY'],
  ['EKODI Community', 'Community'],
  ['<span><strong>EKODI</strong><small>COMMUNITY</small></span>', '<span><strong>COMMUNITY</strong></span>'],
  ['에코디출판', '출판'],
  ['에코디 출판', '출판'],
  ['EKODI Publishing', 'Publishing'],
  ['EKODI PUBLISHING', 'PUBLISHING'],
  ['에코디 마케팅 AI', '마케팅 AI'],
  ['EKODI Marketing AI', 'Marketing AI'],
  ['EKODI MARKETING AI', 'MARKETING AI'],
  ['에코디 지원사업 AI', '지원사업 AI'],
  ['EKODI Support Opportunity AI', 'Support Opportunity AI'],
  ['EKODI SUPPORT OPPORTUNITY AI', 'SUPPORT OPPORTUNITY AI'],
  ['에코디 크리에이터 AI', '크리에이터 AI'],
  ['EKODI Creator AI', 'Creator AI'],
  ['EKODI CREATOR AI', 'CREATOR AI'],
  ['에코디 에너지 AI', '에너지 AI'],
  ['EKODI Energy AI', 'Energy AI'],
  ['EKODI ENERGY AI', 'ENERGY AI'],
  ['<span>EKODI <b>ENERGY AI</b></span>', '<span><b>ENERGY AI</b></span>'],
  ['EKODI Life AI', 'Life AI'],
  ['EKODI LIFE AI', 'LIFE AI']
]);

const adminReplacements = new Map([
  ["name: 'Business OS'", "name: '비즈니스 OS'"],
  ["name:'Business OS'", "name:'비즈니스 OS'"],
  ["name: 'Creator AI'", "name: '크리에이터 AI'"],
  ["name:'Creator AI'", "name:'크리에이터 AI'"],
  ["name: 'Marketing AI'", "name: '마케팅 AI'"],
  ["name:'Marketing AI'", "name:'마케팅 AI'"],
  ["name: 'Energy AI'", "name: '에너지 AI'"],
  ["name:'Energy AI'", "name:'에너지 AI'"],
  ["name: '오늘의 질문 · 인생AI'", "name: '오늘의 질문'"],
  ["name:'오늘의 질문 · 인생AI'", "name:'오늘의 질문'"],
  ["name: '에코디북스'", "name: '에코디서점'"],
  ["name:'에코디북스'", "name:'에코디서점'"],
  ["name: 'EKODI Education'", "name: '에코디교육'"],
  ["name:'EKODI Education'", "name:'에코디교육'"],
  ["name: 'EKODI Social'", "name: '에코디 소셜'"],
  ["name:'EKODI Social'", "name:'에코디 소셜'"],
  ["name: 'EKODI Trading'", "name: '에코디 트레이딩'"],
  ["name:'EKODI Trading'", "name:'에코디 트레이딩'"],
  ["name: 'EKODI Pay'", "name: '에코디 페이'"],
  ["name:'EKODI Pay'", "name:'에코디 페이'"],
  ["name: 'My EKODI'", "name: '마이 에코디'"],
  ["name:'My EKODI'", "name:'마이 에코디'"],
  ["name: 'EKODI Work'", "name: '에코디 워크'"],
  ["name:'EKODI Work'", "name:'에코디 워크'"],
  ["name: 'EKODI Insurance'", "name: '에코디보험'"],
  ["name:'EKODI Insurance'", "name:'에코디보험'"],
  ["name: 'EKODI Mail'", "name: '에코디 메일'"],
  ["name:'EKODI Mail'", "name:'에코디 메일'"],
  ["name: 'EKODI Live'", "name: '에코디 라이브'"],
  ["name:'EKODI Live'", "name:'에코디 라이브'"],
  ["name: 'EKODI Cloud'", "name: '에코디 클라우드'"],
  ["name:'EKODI Cloud'", "name:'에코디 클라우드'"],
  ['<strong>EKODI 기본 메일</strong>', '<strong>에코디 메일</strong>'],
  ['<strong>EKODI Live</strong>', '<strong>에코디 라이브</strong>'],
  ['<strong>EKODI Cloud</strong>', '<strong>에코디 클라우드</strong>'],
  ['<strong>마케팅AI</strong>', '<strong>마케팅 AI</strong>'],
  ['<strong>출판</strong><small>books.ekodi.kr</small>', '<strong>에코디서점</strong><small>books.ekodi.kr</small>']
]);

const displayNames = [
  'Business OS',
  'Management Platform',
  'Shop Platform',
  'Community',
  'Publishing',
  'Marketing AI',
  'Support Opportunity AI',
  'Creator AI',
  'Energy AI',
  'Life AI'
];

const allowedExtensions = new Set(['.html', '.js', '.mjs', '.json', '.jsx', '.ts', '.tsx', '.yml', '.yaml']);
const ignoredDirectories = new Set(['.git', '.github', 'node_modules', 'dist', '.wrangler']);
const adminSurfaceFiles = new Set([
  'admin-shell.html',
  'campus-actions.js',
  'admin-lazy-features.js',
  'admin-menu-layout.js',
  'admin-menu-registry.js',
  'admin-menu-runtime.js',
  'admin-sidebar.js'
]);
const changed = [];
const scanned = [];
const remaining = [];

const adminScopeEntries = [
  "    { domain:'bible.ekodi.kr', name:'에코디 말씀대화', group:'Community', role:'말씀·묵상·실천 대화', aliases:['말씀대화','성경대화','bible'] },",
  "    { domain:'cafe.ekodi.kr', name:'에코디 카페', group:'Community', role:'카페·모임·커뮤니티 준비 공간', aliases:['카페','cafe'] },",
  "    { domain:'business.ekodi.kr', name:'비즈니스 OS', group:'Business & Commerce', role:'AI 기반 공통 사업 운영', aliases:['비즈니스 os','business os','business'] },",
  "    { domain:'management.ekodi.kr', name:'경영플랫폼', group:'Business & Commerce', role:'전문 경영AI 선택·연결', aliases:['경영플랫폼','경영 플랫폼','management'] },",
  "    { domain:'shop.ekodi.kr', name:'쇼핑플랫폼', group:'Business & Commerce', role:'독립 쇼핑몰 생성·운영', aliases:['쇼핑플랫폼','쇼핑 플랫폼','shop'] },",
  "    { domain:'invest.ekodi.kr', name:'에코디 투자', group:'Business & Commerce', role:'투자 검토·실사·연결', aliases:['투자','invest'] },",
  "    { domain:'support.ekodi.kr', name:'지원사업 AI', group:'Business & Commerce', role:'지원사업 탐색·신청·정산', aliases:['지원사업 ai','지원사업','support'] },",
  "    { domain:'money.ekodi.kr', name:'에코디 머니', group:'Business & Commerce', role:'계좌·자동이체 금융정리 안내', aliases:['머니','money'] },",
  "    { domain:'publishing.ekodi.kr', name:'출판', group:'Knowledge & Content', role:'출판상담·제작·대행·유통', aliases:['출판','publishing'] },",
  "    { domain:'author.ekodi.kr', name:'크리에이터 AI', group:'Knowledge & Content', role:'글·창작 전반 AI 지원', aliases:['크리에이터 ai','작가ai','creator ai','author'] },",
  "    { domain:'my.ekodi.kr', name:'마이 에코디', group:'Work & Life', role:'개인 활동·서비스 허브', aliases:['마이 에코디','my ekodi','my'] },",
  "    { domain:'work.ekodi.kr', name:'에코디 워크', group:'Work & Life', role:'업무·프로젝트 실행 공간', aliases:['워크','업무','work'] },",
  "    { domain:'energy.ekodi.kr', name:'에너지 AI', group:'Work & Life', role:'전기·에너지 상태 분석·제안', aliases:['에너지 ai','에너지','energy'] },",
  "    { domain:'ins.ekodi.kr', name:'에코디보험', group:'Work & Life', role:'보험 진단·관리·청구 허브', aliases:['보험','insurance','ins'] },",
  "    { domain:'messenger.ekodi.kr', name:'에코디 메신저', group:'Communication & Cloud', role:'사람·AI·공간 대화 연결', aliases:['메신저','messenger'] },",
  "    { domain:'media.ekodi.kr', name:'에코디미디어', group:'Communication & Cloud', role:'영상·미디어 콘텐츠 연결', aliases:['미디어','media'] },"
];

function isAdminSurface(relative) {
  if (adminSurfaceFiles.has(relative)) return true;
  const base = path.basename(relative);
  return /admin/i.test(base) && /\.(?:html|js|mjs|jsx|ts|tsx)$/.test(base);
}

function ensureAdminScopeServices(source) {
  const marker = '  const SITE_META = [';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('\n  ];', start);
  if (end < 0) return source;
  const missing = adminScopeEntries.filter(line => {
    const match = line.match(/domain:'([^']+)'/);
    return match && !source.includes(`domain:'${match[1]}'`);
  });
  if (!missing.length) return source;
  return `${source.slice(0, end)}\n${missing.join('\n')}${source.slice(end)}`;
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!entry.isFile() || absolute === selfPath || !allowedExtensions.has(path.extname(entry.name))) continue;

    const relative = path.relative(root, absolute);
    scanned.push(relative);
    let source = fs.readFileSync(absolute, 'utf8');
    const original = source;
    for (const [from, to] of replacements) source = source.split(from).join(to);
    if (isAdminSurface(relative)) {
      for (const [from, to] of adminReplacements) source = source.split(from).join(to);
      if (relative === 'admin-lazy-features.js') source = ensureAdminScopeServices(source);
    }
    if (source !== original) changed.push(relative);
  }
}

walk(root);

function scanFile(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const banned of replacements.keys()) {
    if (source.includes(banned)) remaining.push(`${relative}: ${banned}`);
  }
  if (isAdminSurface(relative)) {
    for (const banned of adminReplacements.keys()) {
      if (source.includes(banned)) remaining.push(`${relative}: stale admin display ${banned}`);
    }
  }
  if (path.extname(relative) === '.html') {
    const renderedText = source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    for (const name of displayNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp(`EKODI\\s+${escaped}`, 'i').test(renderedText)) {
        remaining.push(`${relative}: rendered EKODI ${name}`);
      }
    }
  }
}

for (const relative of scanned) scanFile(relative);

const adminChecks = {
  'campus-actions.js': [
    "name: '비즈니스 OS'", "name: '에코디서점'", "name: '크리에이터 AI'", "name: '마케팅 AI'", "name: '에너지 AI'"
  ],
  'admin-lazy-features.js': [
    "domain:'business.ekodi.kr'", "name:'비즈니스 OS'", "domain:'management.ekodi.kr'", "name:'경영플랫폼'",
    "domain:'shop.ekodi.kr'", "name:'쇼핑플랫폼'", "domain:'support.ekodi.kr'", "name:'지원사업 AI'",
    "domain:'author.ekodi.kr'", "name:'크리에이터 AI'", "domain:'energy.ekodi.kr'", "name:'에너지 AI'"
  ],
  'admin-shell.html': ['<strong>에코디 메일</strong>', '<strong>에코디 라이브</strong>', '<strong>에코디 클라우드</strong>', '<strong>마케팅 AI</strong>'],
};

for (const [relative, required] of Object.entries(adminChecks)) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    remaining.push(`${relative}: required admin surface missing`);
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const marker of required) {
    if (!source.includes(marker)) remaining.push(`${relative}: missing canonical admin marker ${marker}`);
  }
}

for (const relative of changed) remaining.push(`${relative}: source requires canonical display-name normalization`);
if (remaining.length) {
  console.error('Prefix-free display-name validation failed:');
  for (const item of [...new Set(remaining)]) console.error(`- ${item}`);
  process.exit(1);
}
console.log('Platform, specialist AI and admin display names follow the canonical prefix-free policy.');
