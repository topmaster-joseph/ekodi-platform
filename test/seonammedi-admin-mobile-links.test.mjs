import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../sites/seonammedi/public/admin/',import.meta.url);
const [html,js,css,minutes,native,workflow]=await Promise.all([
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('admin.js',root),'utf8'),
  readFile(new URL('admin.css',root),'utf8'),
  readFile(new URL('admin-minutes.js',root),'utf8'),
  readFile(new URL('../scripts/verify-seonammedi-admin-nav-native.mjs',import.meta.url),'utf8'),
  readFile(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8')
]);

test('finance and minutes are canonical deep links with consistent selected state',()=>{
  const anchors=html.match(/<a[^>]*>/g)||[];
  for(const name of ['dashboard','minutes','finance','access']){
    assert.ok(anchors.some(a=>a.includes('data-panel-target="'+name+'"')&&a.includes('href="?panel='+name+'"')),'missing deep-link '+name);
  }
  assert.match(html,/<a href="\?panel=finance" class="admin-finance-link" data-panel-target="finance">회계 관리<\/a>/);
  assert.match(html,/href="\?panel=minutes" data-go="minutes"/);
  assert.match(js,/node\.classList\.toggle\('active',active\)/);
  assert.match(js,/node\.setAttribute\('aria-current','page'\)/);
  assert.match(js,/navigateAdminPanel\(event,node,node\.dataset\.panelTarget\)/);
  assert.match(js,/event\.preventDefault\(\)/);
  assert.match(js,/addEventListener\('popstate',\(\)=>restoreAdminRoute\(\)\)/);
});

test('admin sign-in always returns to the originally requested panel, without arbitrary query or fragments',()=>{
  const first=js.indexOf('function adminReturnUrl(){');
  const end=js.indexOf('function authUrl(){',first);
  assert.ok(first>=0&&end>first);
  const evaluate=location=>new Function('location',js.slice(first,end)+'return adminReturnUrl();')(location);
  for(const panel of ['finance','minutes','access']){
    assert.equal(evaluate({hostname:'ekodi.kr',pathname:'/seonammedi/admin/',origin:'https://ekodi.kr',search:'?panel='+panel+'&token=not-allowed'}),
      'https://ekodi.kr/seonammedi/admin/?panel='+panel);
    assert.equal(evaluate({hostname:'seonammedi.kr',pathname:'/admin/',origin:'https://seonammedi.kr',search:'?panel='+panel}),
      'https://seonammedi.kr/admin/?panel='+panel);
  }
  assert.equal(evaluate({hostname:'ekodi.kr',pathname:'/seonammedi/admin/',origin:'https://ekodi.kr',search:'?panel=finance&ekodi_token=invalid'}),
    'https://ekodi.kr/seonammedi/admin/?panel=finance');
  assert.match(js,/restoreAdminRoute\(\); \/\/ Show the requested panel immediately/);
});

test('minutes direct-link routing, first load and copying a meeting link use the correct site mount',()=>{
  assert.match(js,/document\.dispatchEvent\(new CustomEvent\('seonammedi:panel-change'/);
  assert.match(minutes,/document\.addEventListener\('seonammedi:panel-change'/);
  assert.match(minutes,/event\.detail\?\.panel==='minutes'/);
  const first=minutes.indexOf('function minuteShareUrl(token){');
  const end=minutes.indexOf('async function copyLink(',first);
  assert.ok(first>=0&&end>first);
  const share=(location,token)=>new Function('location',minutes.slice(first,end)+'return minuteShareUrl;')(location)(token);
  assert.equal(share({hostname:'ekodi.kr',pathname:'/seonammedi/admin/',origin:'https://ekodi.kr'},'sample-token'),
    'https://ekodi.kr/seonammedi/minutes/?token=sample-token');
  assert.equal(share({hostname:'seonammedi.kr',pathname:'/admin/',origin:'https://seonammedi.kr'},'sample-token'),
    'https://seonammedi.kr/minutes/?token=sample-token');
  assert.match(minutes,/form\.elements\.status\.value='shared'/);
  assert.match(js,/minutes:Boolean\(me\.permissions\?\.pages\)/);
});

test('mobile controls prevent Korean word splitting and stay legible at narrow widths',()=>{
  assert.match(css,/\.sidebar-menu \[data-panel-target\]\.active/);
  assert.match(css,/\.heading>\.secondary,\.card-head>\.secondary/);
  assert.match(css,/white-space:nowrap;word-break:keep-all/);
  assert.match(css,/@media\(max-width:560px\)\{\s*\.metrics\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  for(const x of ['320','390','768','1366','1440'])assert.ok(native.includes("label:'"+x+"'"),x);
  assert.match(native,/blockedWrites!==0/);
  assert.match(native,/credentialUse|syntheticAdmin:true/);
  assert.match(workflow,/node scripts\/verify-seonammedi-admin-nav-native\.mjs/);
});


test('finance page has only four compact tab panes, without duplicated right-hand heading',()=>{
  const start=html.indexOf('data-panel="finance"');
  const end=html.indexOf('data-panel="access"',start);
  assert.ok(start>0&&end>start);
  const finance=html.slice(start,end);
  assert.doesNotMatch(finance,/FINANCE ADMIN|<div class="heading"/);
  assert.match(finance,/role="tablist" aria-label="회계 관리 세부 메뉴"/);
  const tabs=['summary','ledger','manual','import'];
  const labels=['회계현황','전체내역','개별등록','원본등록'];
  const panes=['financePaneSummary','financePaneLedger','financePaneManual','financePaneImport'];
  for(let i=0;i<tabs.length;i++){
    const tag=finance.match(new RegExp('<button[^>]*data-finance-tab="'+tabs[i]+'"[^>]*>[^<]*<\\/button>'))?.[0];
    assert.ok(tag,'missing finance tab '+tabs[i]);
    assert.ok(tag.includes('aria-controls="'+panes[i]+'"'));
    assert.ok(tag.includes('>'+labels[i]+'</button>'));
    assert.match(finance,new RegExp('id="'+panes[i]+'"[^>]*role="tabpanel"'));
  }
  assert.equal((finance.match(/role="tablist"/g)||[]).length,1);
  assert.equal((finance.match(/role="tabpanel"/g)||[]).length,4);
  assert.equal((finance.match(/aria-selected="true"/g)||[]).length,1);
  for(const id of ['financeSummary','reloadFinance','financeList','financeForm','financeReportImportCard','financeImportButton']){
    assert.equal((finance.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'duplicate or missing '+id);
  }
  for(const value of ['ledger','manual','import'])
    assert.match(finance,new RegExp('data-finance-pane="'+value+'"[^>]*hidden'));
  assert.match(finance,/거래 세부내역을 전송하지 않습니다/);
});

test('finance tab deep link persists across login, navigation, edit and refresh',()=>{
  const start=js.indexOf('function adminReturnUrl(){');
  const end=js.indexOf('function authUrl(){',start);
  const makeReturn=location=>new Function('location','URL','URLSearchParams',js.slice(start,end)+'return adminReturnUrl()')(location,URL,URLSearchParams);
  const base={hostname:'ekodi.kr',pathname:'/seonammedi/admin/',origin:'https://ekodi.kr'};
  assert.equal(makeReturn({...base,search:'?panel=finance&financeTab=import&unexpected=secret'}),
    'https://ekodi.kr/seonammedi/admin/?panel=finance&financeTab=import');
  assert.equal(makeReturn({...base,search:'?panel=finance&financeTab=bad'}),
    'https://ekodi.kr/seonammedi/admin/?panel=finance');
  assert.equal(makeReturn({...base,search:'?panel=minutes&financeTab=import'}),
    'https://ekodi.kr/seonammedi/admin/?panel=minutes');
  assert.match(js,/url\.searchParams\.set\('financeTab',activeFinanceTab\)/);
  assert.match(js,/url\.searchParams\.delete\('financeTab'\)/);
  assert.match(js,/showFinanceTab\(selected\|\|activeFinanceTab,\{route:false\}\)/);
  assert.match(js,/showPanel\('finance'\);showFinanceTab\('manual'\)/);
  assert.match(js,/event\.key==='ArrowRight'/);
  assert.match(js,/node\.setAttribute\('aria-selected',active\?'true':'false'\)/);
  assert.match(css,/\.finance-pane\[hidden\]\{display:none!important\}/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
