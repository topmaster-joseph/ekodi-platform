import fs from 'node:fs';

const adminPath='workspace-admin-page.js';
let admin=fs.readFileSync(adminPath,'utf8');
const authRange=/  async function exchangeCentralToken\(\)\{[^\n]*\}\r?\n  async function accessToken\(\)\{[^\n]*\}/;
const authReplacement=[
"  async function supabaseAuth(path,body){const r=await fetch(SUPABASE_URL+path,{method:'POST',headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.msg||d.error_description||d.error||`auth_${r.status}`),{status:r.status});return d}",
"  function normalizeAuthSession(d,current={}){return{accessToken:d.access_token||'',refreshToken:d.refresh_token||current.refreshToken||'',expiresIn:Number(d.expires_in||3600),expiresAt:Number(d.expires_at||0)||Math.floor(Date.now()/1000)+Number(d.expires_in||3600),user:{id:d.user?.id||current.user?.id||'',email:d.user?.email||current.user?.email||''}}}",
"  async function exchangeCentralToken(){const p=new URLSearchParams(location.hash.slice(1));const tokenHash=p.get('ekodi_token');if(!tokenHash)return storedSession();const d=await supabaseAuth('/auth/v1/verify',{token_hash:tokenHash,type:p.get('ekodi_type')||'email'});const session=normalizeAuthSession(d);if(!session.accessToken)throw new Error('로그인 연결에 실패했습니다.');saveSession(session);history.replaceState(null,'',location.pathname+location.search);return session}",
"  async function accessToken(){let s=storedSession();if(!s?.accessToken)return'';const now=Math.floor(Date.now()/1000);if(!s.expiresAt||Number(s.expiresAt)>now+60)return s.accessToken;if(!s.refreshToken){clearSession();return''}try{const d=await supabaseAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refreshToken});const session=normalizeAuthSession(d,s);if(!session.accessToken){clearSession();return''}saveSession(session);return session.accessToken}catch{clearSession();return''}}"
].join('\n');
if(!authRange.test(admin))throw new Error('workspace auth range not found');
admin=admin.replace(authRange,authReplacement);
fs.writeFileSync(adminPath,admin);

const testPath='test/site-local-admin.test.mjs';
let tests=fs.readFileSync(testPath,'utf8');
const needle="  assert.match(js, /subject_type=tenant/);";
const extra=[
needle,
"  assert.ok(js.includes('/auth/v1/verify'));",
"  assert.ok(js.includes('/auth/v1/token?grant_type=refresh_token'));",
"  assert.ok(js.includes('token_hash'));",
"  assert.ok(js.includes('apikey:SUPABASE_KEY'));",
"  assert.ok(!js.includes(\"fetch('/api/auth/exchange'\"));",
"  assert.ok(!js.includes(\"fetch('/api/auth/refresh'\"));"
].join('\n');
if(!tests.includes(needle))throw new Error('site-local admin assertion anchor not found');
if(!tests.includes("/auth/v1/verify"))tests=tests.replace(needle,extra);
fs.writeFileSync(testPath,tests);
