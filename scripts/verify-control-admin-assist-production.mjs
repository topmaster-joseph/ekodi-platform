import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const apiToken=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!accountId||!apiToken)throw new Error('Cloudflare production verification credentials are required.');

const config=await fs.readFile(new URL('../wrangler.api.toml',import.meta.url),'utf8');
const databaseId=config.match(/\[\[d1_databases\]\][\s\S]*?binding\s*=\s*"DB"[\s\S]*?database_id\s*=\s*"([^"]+)"/)?.[1]||'';
if(!databaseId)throw new Error('Control API D1 database id was not resolved.');

async function query(sql){
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,{
    method:'POST',
    headers:{authorization:`Bearer ${apiToken}`,'content-type':'application/json'},
    body:JSON.stringify({sql}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body?.success!==true)throw new Error(`D1 verification query failed: HTTP ${response.status}`);
  return body;
}
function firstResult(body){return body?.result?.[0]?.results?.[0]||null}
async function optionalFirst(sql){try{return firstResult(await query(sql))}catch{return null}}

const admin=firstResult(await query("SELECT id FROM admins WHERE role='super_admin' ORDER BY id LIMIT 1"));
const adminId=Number(admin?.id);
if(!Number.isInteger(adminId)||adminId<1)throw new Error('No production super-admin account is available for Assist verification.');

const token=crypto.randomBytes(32).toString('hex');
const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
const created=new Date().toISOString();
const expires=new Date(Date.now()+10*60*1000).toISOString();
const budgetBefore=await optionalFirst("SELECT usage_date,call_count FROM ai_provider_daily_budget WHERE provider_id='cloudflare-workers-ai' ORDER BY usage_date DESC LIMIT 1");

let verification=null;
try{
  await query(`INSERT INTO sessions (token_hash,admin_id,expires_at,created_at) VALUES ('${tokenHash}',${adminId},'${expires}','${created}')`);
  const response=await fetch('https://ekodi.kr/api/control/ai/assist',{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({
      message:'EKODI production AI verification. Reply with exactly EKODI_AI_OK.',
      page:{section:'command-home',title:'에코디와 대화하기',pathname:'/admin/'},
      history:[],
    }),
  });
  const body=await response.json().catch(()=>({}));
  verification={
    httpStatus:response.status,
    ok:body?.ok===true,
    mode:String(body?.mode||''),
    provider:String(body?.provider||''),
    costClass:String(body?.costClass||''),
    degraded:body?.degraded===true,
    attemptedProviders:Array.isArray(body?.attemptedProviders)?body.attemptedProviders:[],
    providerFailures:Array.isArray(body?.providerFailures)?body.providerFailures:[],
    blockedProviders:Array.isArray(body?.blockedProviders)?body.blockedProviders:[],
    replyLength:String(body?.reply||'').trim().length,
  };
  const zeroCost=new Set(['free-preferred','google-free-quota','account-managed','chatgpt-plan-included','claude-subscription','core-only']);
  if(response.status!==200||!verification.ok||verification.mode!=='ai'||verification.degraded||!verification.provider||!zeroCost.has(verification.costClass)){
    throw new Error('Production Admin Assist did not return a real zero-marginal-cost provider response.');
  }
  if(['openai','anthropic'].includes(verification.provider)){
    throw new Error('Production Admin Assist attempted a paid-opt-in provider without delegated budget.');
  }
}finally{
  await query(`DELETE FROM sessions WHERE token_hash='${tokenHash}'`).catch(()=>{});
}
const budgetAfter=await optionalFirst("SELECT usage_date,call_count FROM ai_provider_daily_budget WHERE provider_id='cloudflare-workers-ai' ORDER BY usage_date DESC LIMIT 1");
console.log(JSON.stringify({
  verified:true,
  ...verification,
  workersAiBudgetBefore:budgetBefore&&{usageDate:budgetBefore.usage_date,callCount:Number(budgetBefore.call_count||0)},
  workersAiBudgetAfter:budgetAfter&&{usageDate:budgetAfter.usage_date,callCount:Number(budgetAfter.call_count||0)},
},null,2));
