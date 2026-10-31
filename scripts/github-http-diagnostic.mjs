// EKODI: allowlisted diagnostic only. Never emit credentials, raw headers or raw body.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const get=(h,k)=>typeof h?.get==='function'?h.get(k):Object.entries(h||{}).find(([n])=>n.toLowerCase()===k)?.[1]??null;
const int=v=>v!=null&&/^\d{1,16}$/.test(String(v).trim())&&Number.isSafeInteger(Number(v))?Number(v):null;
const resources=new Set(['core','search','graphql','integration_manifest','source_import','code_scanning_upload','actions_runner_registration','audit_log','code_search']);
export function classifyGitHubHttp({status,headers,data,nowMs=Date.now()}){
  const code=Number(status),remaining=int(get(headers,'x-ratelimit-remaining')),
    limit=int(get(headers,'x-ratelimit-limit')),reset=int(get(headers,'x-ratelimit-reset')),
    rawResource=get(headers,'x-ratelimit-resource'),resource=resources.has(rawResource)?rawResource:null;
  const retry=get(headers,'retry-after');let retryAt=null;
  if(retry!=null&&/^\d{1,6}$/.test(String(retry).trim()))retryAt=nowMs+Number(retry)*1000;
  else if(retry!=null&&String(retry).length<=96){
    const when=Date.parse(String(retry));if(Number.isFinite(when)&&when>=nowMs)retryAt=when;
  }
  const resetAt=reset!=null&&reset*1000>0&&reset*1000<8640000000000000?reset*1000:null;
  const msg=typeof data?.message==='string'?data.message.toLowerCase().slice(0,1024):'';
  const permission=/resource not accessible by integration|requires? (?:the )?[^.]{0,80}permission|insufficient (?:token )?permissions|must have .* permission/.test(msg);
  const secondary=/secondary rate limit|abuse detection|please wait a few minutes before you try again/.test(msg);
  const primary=/api rate limit exceeded|primary rate limit/.test(msg);
  let classification='http_error';
  if(code===403||code===429){
    if(code===403&&permission)classification='permission_denied';
    else if(remaining===0||primary)classification='primary_rate_limit';
    else if(secondary||retryAt!==null||code===429)classification='secondary_rate_limit';
    else classification='unknown_403';
  }else if(code===401)classification='authentication_failed';
  else if(code===422)classification='policy_rejected';
  const blockedUntilMs=['primary_rate_limit','secondary_rate_limit'].includes(classification)?
    (Math.max(retryAt||0,remaining===0?resetAt||0:0)||null):null;
  return Object.freeze({status:Number.isInteger(code)?code:null,classification,resource,
    remaining,limit,resetAt,retryAt,blockedUntilMs});
}
export function parseCurlHeaders(raw){
  const blocks=String(raw||'').split(/\r?\n\r?\n/).filter(x=>/^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(x.trim()));
  const lines=(blocks.at(-1)||'').split(/\r?\n/).slice(1),out={};
  for(const line of lines){
    const i=line.indexOf(':');if(i<1)continue;
    const k=line.slice(0,i).trim().toLowerCase();
    if(['x-ratelimit-remaining','x-ratelimit-limit','x-ratelimit-reset','x-ratelimit-resource','retry-after'].includes(k))
      out[k]=line.slice(i+1).trim();
  }
  return out;
}
export const safeGitHubHttpDiagnostic=args=>'[EKODI GitHub] '+JSON.stringify(classifyGitHubHttp(args));
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const [,,status,headersPath,bodyPath]=process.argv;let headers={},data={};
  try{headers=parseCurlHeaders(readFileSync(headersPath,'utf8').slice(-16384));}catch{}
  try{data=JSON.parse(readFileSync(bodyPath,'utf8').slice(0,16384));}catch{}
  process.stderr.write(safeGitHubHttpDiagnostic({status:Number(status),headers,data})+'\n');
}
