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
  for(const name of ['dashboard','minutes','finance','access']){
    assert.match(html,new RegExp('data-panel-target="'+name+'"[^>]*href="\\?panel='+name+'"'),'missing deep-link '+name);
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
