// EKODI Publisher: read-only count audit. No PII, IDs, or SQL parameters in output.
// Executed ONLY by a manually triggered main-branch protected GitHub Actions job.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const TITLE1='희년과 하나님 나라의 회복';
const TITLE2='우리는 다시 돌아갈 수 있는가';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[0-9a-f]{32}$/i;
const SQL=`SELECT
  SUM(CASE WHEN title=? THEN 1 ELSE 0 END) AS volume1_count,
  SUM(CASE WHEN title=? THEN 1 ELSE 0 END) AS volume2_count,
  COUNT(*) AS total_count
FROM publishing_workflow_projects
WHERE author_user_id=? AND collection_id='human'
  AND field_id='humanities' AND title IN (?,?)`;
export function publisherDbId(toml){
  const found=[...toml.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\[\[|\[vars\]|$)/g)];
  const selected=found.find(x=>/^\s*binding\s*=\s*"PUBLISH_DB"\s*$/m.test(x[1]));
  const m=selected?.[1].match(/^\s*database_id\s*=\s*"([0-9a-f-]{36})"\s*$/m);
  if(!m||!UUID.test(m[1]))throw Error('PUBLISHING_DB_CONFIG_UNAVAILABLE');
  return m[1];
}
export function summarizeD1Result(raw){
  // Fail closed if the response does not represent one successful SELECT.
  if(raw?.success!==true||!Array.isArray(raw.result)||raw.result.length!==1||
    raw.result[0]?.success!==true||raw.result[0]?.meta?.changed_db===true||
    !Array.isArray(raw.result[0]?.results)||raw.result[0].results.length!==1)
    throw Error('D1_READONLY_RESPONSE_UNVERIFIED');
  const row=raw.result[0].results[0];
  const toCount=value=>{
    const v=value===null?0:value;
    if(!Number.isSafeInteger(v)||v<0||v>100000)return null;
    return v;
  };
  const v1=toCount(row.volume1_count);
  const v2=toCount(row.volume2_count);
  const total=toCount(row.total_count);
  if(v1===null||v2===null||total===null||v1+v2!==total)
    throw Error('D1_READONLY_COUNT_INVALID');
  const state=v1===1&&v2===1?'two-private-projects-present':
    v1>1||v2>1?'duplicate-projects-investigate':
    'project-registration-required';
  return Object.freeze({
    check:'jubilee-author-private-workflow-counts',
    volume1Count:v1,volume2Count:v2,state,
    twoProjectsConfirmed:state==='two-private-projects-present',
    manuscriptIngested:false,publicationApproved:false,publicSaleAuthorized:false,
  });
}
export async function auditJubileeProduction({env,fetchImpl=fetch,toml}={}){
  const vars=env||{};
  const owner=String(vars.PUBLISHING_JUBILEE_AUTHOR_USER_ID||'');
  const token=String(vars.CLOUDFLARE_API_TOKEN||'');
  const account=String(vars.CLOUDFLARE_ACCOUNT_ID||'');
  if(!UUID.test(owner)||token.length<12||!ACCOUNT.test(account))
    throw Error('READONLY_AUDIT_CREDENTIALS_UNAVAILABLE');
  const database=publisherDbId(toml);
  const url=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetchImpl(url,{
      method:'POST',signal:controller.signal,
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({sql:SQL,params:[TITLE1,TITLE2,owner,TITLE1,TITLE2]}),
    });
    if(!response.ok)throw Error('D1_AUDIT_API_HTTP_'+response.status);
    // Do not log raw D1 API response; use a strict aggregate-only report.
    return summarizeD1Result(await response.json());
  }finally{clearTimeout(timer);}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const toml=readFileSync(new URL('../wrangler.publishing.toml',import.meta.url),'utf8');
    const data=await auditJubileeProduction({env:process.env,toml});
    process.stdout.write(JSON.stringify(data)+'\n');
  }catch(error){
    // Never print untrusted Cloudflare or database response bodies, query parameters or secrets.
    const message=String(error?.message||'');
    const code=/^(READONLY_AUDIT_|D1_|PUBLISHING_DB_)/.test(message)?
      message:'READONLY_AUDIT_FAILED_REDACTED';
    process.stderr.write(code+'\n');
    process.exitCode=1;
  }
}
