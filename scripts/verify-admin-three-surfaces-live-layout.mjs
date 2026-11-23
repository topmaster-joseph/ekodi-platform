// Guest-safe production CSS reflow canary. No real admin session, data or writes.
// Inert fixtures test the deployed styles, not role-authenticated application behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const taskId='admin-3surface-live-canary-20261115';
const dir=path.resolve('artifacts/admin-three-surfaces-layout');
const sourceMode=String(process.env.EKODI_LAYOUT_CANARY_SOURCE || '').trim();
if(sourceMode && sourceMode!=='repo')throw Error('Unrecognized layout source mode');
const cssFiles={devotional:'devotional-admin.css',social:'social-admin.css',church:'church-reports-admin.css'};
const widths=[320,390,768,1366,1440];
const assets={
 devotional:['https://ekodi.kr/devotional-admin.css','DEVOTIONAL-ADMIN-LAYOUT-20261114'],
 social:['https://ekodi.kr/social-admin.css','SOCIAL-ADMIN-LAYOUT-20261114'],
 church:['https://ekodi.kr/church-reports-admin.css?v=20261114-worship-layout1','CHURCH-WORSHIP-LAYOUT-20261114']
};
const baseCss='*{box-sizing:border-box}html,body{margin:0;min-width:0;font:14px/1.5 system-ui,sans-serif;color:#172b42;background:#f6f8fb}'
 +' .layout-fixture{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:100vh}'
 +' .sidebar-fixture{background:#eaf0f6}.main-fixture{min-width:0;padding:16px 20px 100px}'
 +' .main-fixture > section{min-width:0;max-width:100%}'
 +' .main-fixture button,.main-fixture input,.main-fixture textarea{font:inherit}'
 +' .main-fixture input,.main-fixture textarea{max-width:100%;width:100%;padding:8px;border:1px solid #ccd7e5;border-radius:7px}'
 +' .main-fixture label{display:grid;gap:4px;min-width:0}'
 +' .main-fixture .service-row{display:flex;gap:12px;align-items:start;padding:14px;border:1px solid #dce5ee;border-radius:10px;background:#fff}'
 +' .main-fixture .table-wrap{min-width:0;overflow:auto}.main-fixture table{border-collapse:collapse;width:100%}'
 +' .main-fixture th,.main-fixture td{text-align:left;border-bottom:1px solid #dce5ee;padding:8px}'
 +' .main-fixture .trade-form{display:grid;gap:10px}.main-fixture .trade-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'
 +' .main-fixture .actions{display:flex;flex-wrap:wrap;gap:8px}'
 +' .main-fixture .button{display:inline-flex;align-items:center;min-height:40px;padding:6px 10px;border:1px solid #ccd7e5;border-radius:8px;background:white;color:#172b42}'
 +' @media(max-width:900px){.layout-fixture{display:block}.sidebar-fixture{display:none}.main-fixture{padding:12px 10px 90px}}';
const metric=x=>'<article class="social-overview-metric"><small>'+x+'</small><strong>—</strong></article>';
const site=x=>'<article class="social-site-directory-card"><div class="social-site-directory-copy"><small>사용자 사이트</small><strong>'+x+'</strong><span>/ekodichurch/admin/publishing</span></div><div class="social-site-directory-actions"><a class="button">사용자페이지</a><a class="button">사이트 채널센터</a><button>최고관리자에서 관리</button></div></article>';
const devotional='<section id="devotionalPanel" class="devotional-panel">'
 +'<div class="devotional-head"><div><h2>매일묵상 자동화</h2><p>성경본문 → 대본 → 영상 → YouTube 예약 게시</p></div><div class="devotional-actions"><button class="devotional-btn">새로고침</button><button class="devotional-btn primary">본문 등록</button><button class="devotional-btn primary" disabled>일괄 생성</button></div></div>'
 +'<div class="devotional-summary">'+['등록 본문','영상 완료','YouTube 예약','렌더 노드'].map(x=>'<div class="devotional-card"><b>0</b><span>'+x+'</span></div>').join('')+'</div>'
 +'<div class="devotional-channel-grid"><div class="devotional-channel"><strong>에코디교회</strong><small>YouTube OAuth 연결 필요</small></div><div class="devotional-channel"><strong>에코디선교회</strong><small>YouTube OAuth 연결 필요</small></div></div>'
 +'<div class="devotional-table-wrap"><table class="devotional-table"><thead><tr><th>날짜</th><th>본문</th><th>영상</th><th>에코디교회</th><th>에코디선교회</th></tr></thead><tbody><tr><td>10/01</td><td>신명기 28:27-37</td><td><span class="devotional-pill wait">대본 준비</span></td><td><span class="devotional-pill blocked">채널 미연결</span></td><td><span class="devotional-pill blocked">채널 미연결</span></td></tr></tbody></table></div></section>';
const social='<section id="socialAdmin" class="social-admin"><div class="social-admin-head"><div><p>MULTI-CHANNEL CONTROL CENTER</p><h2>소셜 채널 통합관리</h2><p class="operations-copy">사이트별 계정·채널 운영 정책을 관리합니다.</p></div><div class="social-admin-actions"><button>소셜 허브</button><button>전체 새로고침</button></div></div>'
 +'<div class="social-overview-metrics">'+['등록 사이트','연결 계정','게시 가능','연결 확인 필요'].map(metric).join('')+'</div>'
 +'<div class="social-workspace-tabs">'+['사이트별 채널','계정 연결','게시 채널 배정','기관·정책'].map(x=>'<button class="social-workspace-tab">'+x+'</button>').join('')+'</div>'
 +'<div class="social-site-directory"><div class="social-channel-head"><h3>전체 사이트·서비스 채널관리</h3></div><div class="social-directory-toolbar"><input type="search" placeholder="사이트 검색"></div><div class="social-site-directory-list">'+['에코디교회','에코디선교회','비비큐 무안청계점','피자마루 목포대점'].map(site).join('')+'</div></div></section>';
const worship='<section id="mainPanel" class="panel">'
 +'<div class="service-row"><div><strong>에코디교회 · 주일모임 전용 관리</strong><p>공통본문 확정 전에는 초안으로 저장하세요.</p></div><a>선교회 토요모임</a></div>'
 +'<section class="service-row"><h2>에코디AI · 주일모임 준비</h2><p>자료를 준비하고 실제 송출은 검증 후 진행합니다.</p><form id="churchAiCommand"><label>예배 준비 명령</label><textarea rows="2">2026년 11월 15일 주일모임</textarea><div class="actions"><button class="button">날짜 분석 · 초안 준비</button><a class="button">교회 사용자 화면</a></div></form><p id="churchAiCommandStatus">자료 상태 확인 전</p></section>'
 +'<div class="table-wrap"><table><thead><tr><th>일자</th><th>공통본문</th><th>말씀 제목</th><th>상태</th><th>관리</th></tr></thead><tbody><tr><td>2026-11-15</td><td>고린도전서 9:19-27</td><td>모든 사람에게</td><td>초안</td><td>편집</td></tr></tbody></table></div>'
 +'<form id="worshipForm" class="trade-form"><div class="trade-grid">'+['주일 날짜','모임 시각','공통 매일묵상 본문','말씀 제목','말씀나눔','찬양'].map(x=>'<label>'+x+'<input></label>').join('')+'<label>대표기도<textarea></textarea></label><label>공지<textarea></textarea></label></div><div class="actions"><button class="button">초안 저장</button><button class="button">검증 후 공개</button></div></form></section>';
const fixtures=[
 {key:'devotional',html:devotional,selector:'#devotionalPanel',grid:'.devotional-summary',table:'.devotional-table-wrap'},
 {key:'social',html:social,selector:'#socialAdmin',grid:'.social-site-directory-list'},
 {key:'church',html:worship,selector:'#mainPanel',grid:'#mainPanel',table:'#mainPanel > .table-wrap',church:true}
];
await fs.mkdir(dir,{recursive:true});
const evidence={taskId,scope:sourceMode==='repo'
  ? 'repository CSS + inert synthetic DOM only (offline, no production requests; NOT live or role-authenticated proof)'
  : 'live CSS + inert synthetic DOM only; no real authenticated user/tenant state',
 sourceMode:sourceMode==='repo'?'repository-offline':'live-css',at:new Date().toISOString(),checks:[]};
const styles={};
for(const [key,[url,marker]] of Object.entries(assets)){
 let css;
 if(sourceMode==='repo'){
   css=await fs.readFile(new URL('../'+cssFiles[key],import.meta.url),'utf8');
 }else{
   const response=await fetch(url,{headers:{'cache-control':'no-cache'}});
   if(response.status===429)throw Error('Cloudflare quota 429, no retry: '+url);
   assert.equal(response.status,200,'live CSS HTTP '+url);
   css=await response.text();
 }
 assert.ok(css.includes(marker),'live CSS marker missing '+marker);
 styles[key]=css;
 evidence.checks.push({kind:'asset',key,source:sourceMode==='repo'?cssFiles[key]:url,marker,sha256:createHash('sha256').update(css).digest('hex'),pass:true});
}
const browser=await chromium.launch({headless:true});
try{
 for(const fixture of fixtures){
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  try{
   const html='<!doctype html><html lang="ko" '+(fixture.church?'data-ekodi-church-unified-admin="true"':'')+'><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>'+baseCss+'</style><style>'+styles[fixture.key]+'</style></head><body class="'+(fixture.church?'':'admin-compact')+'"><div class="layout-fixture layout"><aside class="sidebar-fixture sidebar"></aside><main class="main-fixture" data-ekodi-admin-main>'+fixture.html+'</main></div></body></html>';
   await page.setContent(html,{waitUntil:'load'});
   for(const width of widths){
    await page.setViewportSize({width,height:width<=390?844:900});
    const m=await page.evaluate(({selector,grid,table})=>{
     const host=document.querySelector(selector),g=document.querySelector(grid),t=document.querySelector(table);
     const r=host.getBoundingClientRect();
     const socialLead=document.querySelector('#socialAdmin .social-admin-head>div:first-child');
     const copyEnd=socialLead?.lastElementChild;
     const headerBlank=socialLead&&copyEnd?Math.round(socialLead.getBoundingClientRect().bottom-copyEnd.getBoundingClientRect().bottom):null;
     return {viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,left:r.left,right:r.right,hostWidth:r.width,columns:getComputedStyle(g).gridTemplateColumns.split(/\s+/).filter(Boolean).length,tableOverflow:t?t.scrollWidth-t.clientWidth:0,socialHeaderBlank:headerBlank};
    },{selector:fixture.selector,grid:fixture.grid,table:fixture.table});
    assert.ok(m.hostWidth>120&&m.left>=-2&&m.right<=width+2&&m.overflow<=2,fixture.key+'@'+width+' clipping '+JSON.stringify(m));
    const expected=fixture.key==='devotional'?(width>1100?4:2):fixture.key==='social'?(width>1100?2:1):(width>1180?2:1);
    assert.equal(m.columns,expected,fixture.key+'@'+width+' reflow mismatch '+JSON.stringify(m));
    if(fixture.key==='social'&&width<=760)assert.ok(m.socialHeaderBlank!==null&&m.socialHeaderBlank<=40,'social header wasted vertical space '+JSON.stringify(m));
    evidence.checks.push({kind:'reflow',surface:fixture.key,width,pass:true,metrics:m});
    if(width===390||width===1440)await page.screenshot({path:path.join(dir,fixture.key+'-'+width+'.png'),fullPage:false});
   }
  }finally{await page.close();}
 }
}finally{
 await browser.close();
 await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2));
}
console.log('EKODI_THREE_SURFACES_CSS_CANARY='+JSON.stringify({taskId,checks:evidence.checks.length,pass:true}));
