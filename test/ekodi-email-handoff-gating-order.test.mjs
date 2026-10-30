import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../supabase/functions/identity-api/index.ts',import.meta.url),'utf8');
const start=api.indexOf('async function sessionHandoff(req:Request,user:any){');
const end=api.indexOf('async function listIdentities(req:Request,userId:string){',start);
assert.ok(start>=0&&end>start,'central session handoff exists');
const handler=api.slice(start,end);

function before(a,b){
  const first=handler.indexOf(a),second=handler.indexOf(b);
  assert.ok(first>=0&&second>=0,`missing source anchor: ${a} / ${b}`);
  assert.ok(first<second,`${a} MUST precede ${b}`);
}

test('Unprovisioned email login must be verified BEFORE an Auth magic link is minted',()=>{
  before('const personBeforeHandoff=await personForUser(user.id)','const newEmailPerson=');
  before('const newEmailPerson=','if(newEmailPerson){');
  before('if(!emailPasswordReady())','const link=await issueSupabaseLink(email)');
  before('if(!user.email_confirmed_at)','const link=await issueSupabaseLink(email)');
  before('const link=await issueSupabaseLink(email)','admin.rpc("ensure_person_identity"');
  before('if(link.user.id!==user.id)','admin.rpc("ensure_person_identity"');
  before('admin.rpc("ensure_person_identity"','await recordEmailVerification("email",user.id,true)');
  before('await recordEmailVerification("email",user.id,true)','await syncPerson(user.id)');
});

test('Existing Google-backed Supabase sessions must not be blocked by the new email signup gate',()=>{
  assert.match(handler,/const newEmailPerson=!personBeforeHandoff&&user\.app_metadata\?\.provider==="email"/);
  assert.match(handler,/let personId=personBeforeHandoff/);
  assert.match(handler,/if\(newEmailPerson\)\{/);
  assert.doesNotMatch(handler,/if\(user\.app_metadata\?\.provider==="email"\)\s*\{\s*if\(!emailPasswordReady\(\)\)/);
});

test('The disabled email signup gate cannot mint an unverified email identity',()=>{
  assert.match(api,/Deno\.env\.get\("EKODI_EMAIL_PASSWORD_ENABLED"\)==="true"/);
  assert.match(api,/Deno\.env\.get\("EKODI_AUTH_EMAIL_CONFIRM_VERIFIED"\)==="true"/);
  assert.match(api,/Deno\.env\.get\("EKODI_AUTH_SMTP_VERIFIED"\)==="true"/);
  assert.match(handler,/if\(!emailPasswordReady\(\)\)return json\(req,\{error:"email_password_unavailable"\},503\)/);
  assert.match(handler,/if\(!user\.email_confirmed_at\)return json\(req,\{error:"verified_email_required"\},403\)/);
});
