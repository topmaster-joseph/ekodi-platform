// Read-only, one-page EKODI-owned Chromium diagnostic for Cloudflare's CSP inline hash.
// Logs only SHA256, structural flags and byte lengths; no script bodies or cookie values.
// This diagnostic NEVER changes CSP and NEVER grants trust to blocked script hashes.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {blockedInlineScriptHash,cloudflareJsDetectionHashes} from './education-native-security-observations.mjs';
const TARGET_URL='https://ekodi.kr/edu/study/ai-bootcamp/';
// Reveal only code grammar after Cloudflare's parameter object. Every quoted
// value is redacted, including potential nonces. Never log the parameter values.
export function redactedCloudflareSuffix(body){
 if(!String(body).startsWith('window.__CF$cv$params={'))return null;
 const at=body.indexOf('};');
 if(at<0)return null;
 const params=body.slice('window.__CF$cv$params={'.length,at);
 const keys=[...params.matchAll(/(?:^|,)([a-z]{1,12}):/g)].map(m=>m[1]);
 const suffix=body.slice(at+2);
 const fallback=/\}catch\(e\)\{o='([^']{0,100})'\}\}var u=/.exec(suffix)?.[1]||'';
 return {paramKeys:keys,paramLength:params.length,suffixLength:suffix.length,
   apexFallbackOnly:/^https:\/\/ekodi\.kr(?:\/edu)?\/?$/.test(fallback),fallbackLength:fallback.length,
   suffixGrammar:suffix.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,"'<quoted>'").slice(0,850)};
}
export function summarizeInlineScriptHashes(html,blocked=[]){
 const scripts=[...String(html||'').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
 return scripts.slice(0,40).map((part,i)=>{
  const body=part[1];
  const hash=createHash('sha256').update(body,'utf8').digest('base64');
  const trustedShape=cloudflareJsDetectionHashes('<script>'+body+'</script>').includes(hash);
  return {index:i,sha256:hash,bytes:Buffer.byteLength(body,'utf8'),blocked:blocked.includes(hash),
    currentStrictShape:trustedShape,hasCfParams:body.includes('window.__CF$cv$params'),
    hasSameOriginJsdLoader:body.includes('/cdn-cgi/challenge-platform/scripts/jsd/main.js'),
    hasPrecursorLoader:body.includes('/cdn-cgi/challenge-platform/scripts/precursor/main.js'),
    hasIframeWrapper:body.includes("createElement('iframe')")||body.includes('createElement("iframe")'),
    beginsParams:body.startsWith('window.__CF$cv$params='),
    beginsSelfInvoking:body.startsWith('(function()'),
    containsInnerHtml:body.includes('.innerHTML='),
    redactedShape:(body.includes('/cdn-cgi/challenge-platform/')?redactedCloudflareSuffix(body):null)};
 });
}
async function main(){
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
  const blocked=[];const audits=[];const documents=[];
  ctx.on('response',res=>{
   try{if(res.request().resourceType()!=='document')return;}catch{return;}
   const p=res.text().then(body=>{
    documents.push({urlPath:new URL(res.url()).pathname,status:res.status(),scripts:summarizeInlineScriptHashes(body,blocked)});
   }).catch(e=>documents.push({readFailed:String(e?.name||'error')}));
   audits.push(p);
  });
  const page=await ctx.newPage();
  await page.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method().toUpperCase())?route.continue():route.abort('blockedbyclient'));
  page.on('console',msg=>{const hash=blockedInlineScriptHash(msg.text());if(hash)blocked.push(hash);});
  const response=await page.goto(TARGET_URL,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(800);
  await Promise.all(audits);
  const dom=summarizeInlineScriptHashes(await page.content(),blocked);
  const all=documents.flatMap(x=>x.scripts||[]).concat(dom);
  console.log(JSON.stringify({kind:'read_only_cloudflare_csp_fingerprint',status:response?.status(),
    origin:'https://ekodi.kr',blockedHashes:[...new Set(blocked)],
    documents,rendered:{scriptCount:dom.length,scripts:dom.filter(x=>x.hasCfParams||x.blocked||x.hasSameOriginJsdLoader)},
    matchingActualScript:all.filter(x=>x.blocked),
    mismatchedStrictShape:all.filter(x=>x.blocked&&!x.currentStrictShape).length}));
  await ctx.close();
 }finally{await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error('EKODI CSP fingerprint diagnostic failed: '+e?.message);process.exitCode=1});
