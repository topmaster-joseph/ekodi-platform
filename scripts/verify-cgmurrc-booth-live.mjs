#!/usr/bin/env node
// Live production check for the cgmurrc booth personal links (ekodi.kr/cgmurrc/booth).
//
// Creates two throwaway members (A, B) with fresh keys directly in the canonical D1, then
// exercises the public site and API from outside exactly as a member's phone would:
//   - B's pre-assigned slot can never be changed with A's link
//   - A's own wish lands only on A's row
//   - forged keys, cross-origin writes and member keys on the admin API are refused
// The throwaway members, their rows and their audit rows are always deleted afterwards.
// Keys are generated in memory and never printed.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';

const BASE=process.env.EKODI_BASE_URL||'https://ekodi.kr';
const API=BASE+'/api/cgmurrc/booth';
const EVENT='ramen-2026-10-28';
const WRANGLER=['--yes',`wrangler@${process.env.WRANGLER_VERSION||'4.127.1'}`];
const run=String(process.env.GITHUB_RUN_ID||Date.now()).replace(/\D/g,'').slice(-12);
const A={id:`verify-ci-a-${run}`,name:'검증용A'}, B={id:`verify-ci-b-${run}`,name:'검증용B'};
const results=[];

const b64u=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sha=async k=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(k))).toString('hex');
function d1(sql){
  const out=execFileSync('npx',[...WRANGLER,'d1','execute','ekodi-auth','--remote','--config','wrangler.api.toml','--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const parsed=JSON.parse(out.slice(out.indexOf('[')));
  return parsed?.[0]?.results||[];
}
function check(name,ok,detail=''){results.push({name,ok:Boolean(ok),detail});console.log(`${ok?'✅':'❌'} ${name}${detail?` — ${detail}`:''}`)}
async function call(path,{method='GET',key,body,origin='https://ekodi.kr'}={}){
  const headers={};
  if(key)headers['x-cgmurrc-booth-key']=key;
  if(body){headers['content-type']='application/json';headers['x-ekodi-intake-request']='1';headers.origin=origin}
  const res=await fetch(API+path,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});
  let data=null;try{data=await res.json()}catch{}
  return {status:res.status,data,route:res.headers.get('x-ekodi-route')};
}
async function page(path,needle){
  const res=await fetch(BASE+path,{redirect:'manual'});
  const text=await res.text();
  return {status:res.status,has:text.includes(needle)};
}

async function main(){
  const keyA=b64u(crypto.getRandomValues(new Uint8Array(32))), keyB=b64u(crypto.getRandomValues(new Uint8Array(32)));
  const now=new Date().toISOString();
  d1(`INSERT INTO cgmurrc_booth_members (id,event,name,sort_order,token_hash,token_issued_at,active,created_at,updated_at) VALUES
    ('${A.id}','${EVENT}','${A.name}',990,'${await sha(keyA)}','${now}',1,'${now}','${now}'),
    ('${B.id}','${EVENT}','${B.name}',991,'${await sha(keyB)}','${now}',1,'${now}','${now}')`);
  d1(`INSERT INTO cgmurrc_booth_entries (event,member_id,slot,status,updated_by,updated_at) VALUES ('${EVENT}','${B.id}',6,'assigned','admin','${now}')`);

  // Public pages
  let p=await page('/cgmurrc/booth/','/cgmurrc/booth/app.js');
  check('회원 화면 /cgmurrc/booth/ 제공',p.status===200&&p.has,`HTTP ${p.status}`);
  p=await page('/cgmurrc/booth/app.js','x-cgmurrc-booth-key');
  check('회원 화면 스크립트 제공',p.status===200&&p.has,`HTTP ${p.status}`);
  p=await page('/cgmurrc/booth/admin/','/cgmurrc/booth/admin/app.js');
  check('관리자 화면 /cgmurrc/booth/admin/ 제공',p.status===200&&p.has,`HTTP ${p.status}`);
  // A page whose CSP forbids scripts renders but never runs ("불러오는 중" forever): check the real headers.
  for(const path of ['/cgmurrc/booth/','/cgmurrc/booth/admin/','/cgmurrc/booth/board/']){
    const res=await fetch(BASE+path,{redirect:'manual'});
    const csp=res.headers.get('content-security-policy')||'';
    const scriptSrc=(csp.split(';').map(x=>x.trim()).find(x=>x.startsWith('script-src'))||'');
    const ok=/'self'/.test(scriptSrc)&&!/'none'/.test(scriptSrc)&&(path.endsWith('admin/')?csp.includes('https://renzehysxirjilvdxacv.supabase.co'):true)&&/no-store/.test(res.headers.get('cache-control')||'');
    check(`${path} 스크립트 실행 허용(CSP)·캐시 없음`,ok,`${scriptSrc||'script-src 없음'} / ${res.headers.get('cache-control')||''}`);
  }
  p=await page('/cgmurrc/booth/admin/','id="loginBtn"');
  check('관리자 화면에 로그인 버튼',p.status===200&&p.has,`HTTP ${p.status}`);
  const adminJs=await fetch(BASE+'/cgmurrc/booth/admin/app.js',{redirect:'manual'});
  const adminJsText=await adminJs.text();
  check('관리자 화면 스크립트 제공(자바스크립트 형식)',adminJs.status===200&&/javascript/i.test(adminJs.headers.get('content-type')||'')&&adminJsText.includes('ekodi_token'),
    `HTTP ${adminJs.status} ${adminJs.headers.get('content-type')||''}`);
  const started=Date.now();
  const anon=await call('/admin');
  check('로그인 없는 관리자 API는 바로 401',anon.status===401&&Date.now()-started<10000,`HTTP ${anon.status} ${Date.now()-started}ms`);

  // Public board: anyone, names with 연번 only
  p=await page('/cgmurrc/booth/board/','/cgmurrc/booth/board/app.js');
  check('전체 근무표 화면 /cgmurrc/booth/board/ 제공',p.status===200&&p.has,`HTTP ${p.status}`);
  const pub=await call('/board');
  const pubText=JSON.stringify(pub.data||{});
  check('전체 근무표 API: 로그인 없이 연번·이름만',pub.status===200&&Array.isArray(pub.data?.board)&&pub.data.board.length===8
    &&pub.data.board[6].some(x=>x.name===B.name&&Number.isInteger(x.no))&&!pubText.includes(B.id)&&!pubText.includes('requested'),`HTTP ${pub.status}`);
  // Authentication of personal links
  let r=await call('/me');
  check('키 없는 요청 거부',r.status===401&&r.route==='cgmurrc-booth',`HTTP ${r.status}`);
  r=await call('/me',{key:b64u(crypto.getRandomValues(new Uint8Array(32)))});
  check('위조 키 거부',r.status===401,`HTTP ${r.status}`);
  r=await call('/me',{key:keyA});
  check('A 링크는 A 본인 근무표만 보여 줌',r.status===200&&r.data?.member?.name===A.name&&!JSON.stringify(r.data).includes('token'),`HTTP ${r.status}`);

  // Cross-member protection
  r=await call('/me',{method:'POST',key:keyA,body:{slot:6,action:'drop',member_id:B.id}});
  check('A 링크로 B를 지정한 변경 거부',r.status===400,`HTTP ${r.status} ${r.data?.code||''}`);
  r=await call('/me',{method:'POST',key:keyA,body:{slot:6,action:'drop'}});
  check('A 링크로 B의 16시 배정을 빼려는 시도 거부',r.status===409,`HTTP ${r.status} ${r.data?.code||''}`);
  r=await call('/me',{method:'POST',key:keyA,body:{slot:6,action:'assign'}});
  check('회원이 스스로 확정하는 요청 거부',r.status===400,`HTTP ${r.status}`);
  r=await call('/me',{method:'POST',key:keyA,body:{slot:3,action:'request'},origin:'https://evil.example'});
  check('다른 사이트에서 보낸 변경 거부',r.status===403,`HTTP ${r.status}`);
  r=await call('/admin',{key:keyA});
  check('회원 링크로 관리자 API 접근 거부',[401,403].includes(r.status),`HTTP ${r.status}`);

  // Own change
  r=await call('/me',{method:'POST',key:keyA,body:{slot:3,action:'request'}});
  check('A 본인 13시 희망 접수',r.status===200&&r.data?.mine?.['3']==='requested',`HTTP ${r.status}`);
  r=await call('/me',{key:keyB});
  check('B 화면: 16시 배정 그대로, A 희망은 보이지 않음',r.status===200&&r.data?.mine?.['6']==='assigned'&&r.data?.mine?.['3']===undefined,`HTTP ${r.status}`);

  // Ground truth in the database
  const rows=d1(`SELECT member_id,slot,status FROM cgmurrc_booth_entries WHERE member_id IN ('${A.id}','${B.id}') ORDER BY member_id,slot`);
  const got=rows.map(x=>`${x.member_id===A.id?'A':'B'}:${x.slot}:${x.status}`).join(',');
  check('DB 확인: A는 13시 희망만, B는 16시 배정만',got==='A:3:requested,B:6:assigned',got);
  const audit=d1(`SELECT action FROM cgmurrc_booth_audit WHERE member_id IN ('${A.id}','${B.id}')`).map(x=>x.action).join(',');
  check('감사 로그: 성공한 변경 1건만 기록',audit==='member.request',audit||'(없음)');
}

let failed=false;
try{await main()}catch(error){failed=true;console.error('verification aborted:',error?.message?.replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]')||error)}
finally{
  try{
    d1(`DELETE FROM cgmurrc_booth_entries WHERE member_id IN ('${A.id}','${B.id}')`);
    d1(`DELETE FROM cgmurrc_booth_audit WHERE member_id IN ('${A.id}','${B.id}')`);
    d1(`DELETE FROM cgmurrc_booth_members WHERE id IN ('${A.id}','${B.id}')`);
    const left=d1(`SELECT COUNT(*) AS n FROM cgmurrc_booth_members WHERE id IN ('${A.id}','${B.id}')`)[0]?.n;
    check('검증용 회원·기록 삭제',Number(left)===0,`남은 행 ${left}`);
  }catch(error){failed=true;console.error('cleanup failed:',error?.message||error)}
}
const summary=['## cgmurrc 라면 부스 개인 링크 운영 검증','',`대상: ${BASE}`,'','| 결과 | 항목 | 세부 |','|---|---|---|',
  ...results.map(r=>`| ${r.ok?'✅':'❌'} | ${r.name} | ${r.detail} |`)].join('\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
if(failed||results.some(r=>!r.ok))process.exitCode=1;
