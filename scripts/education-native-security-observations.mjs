// Explicitly observed, narrowly classified browser security blocks.
// These are still recorded as CSP/privacy evidence, never bypassed, never used
// to suppress unexpected network, JavaScript, HTTP, navigation or lesson failures.
export const TELEMETRY_URL='https://ekodi.kr/api/telemetry/visit';
export const BEACON_PREFIX='https://static.cloudflareinsights.com/beacon.min.js/';
import {createHash} from 'node:crypto';

// Cloudflare Bot Management "JavaScript detections" (observed on ekodi.kr from 2026-10-24) injects one inline
// script before </body>. The Education CSP blocks it (no 'unsafe-inline'), which Chromium reports as an
// "Executing inline script" violation carrying the blocked script's sha256. Such a report is accepted only
// when that exact hash belongs to an audited Cloudflare snippet captured from a served document: the same
// strict shape the 서남권의대 live proof accepts (hex ray id, base64 token, fixed same-origin loader).
const CF_JSD_TAG=/<script>(window\.__CF\$cv\$params=\{r:'[0-9a-f]{16}',t:'[A-Za-z0-9+\/=]+'(?:,[a-z]{1,8}:(?:'[A-Za-z0-9+\/=_.\-]*'|\d{1,6}))*\};([^<]*))<\/script>/g;
const CF_NONCE="(?:[a-z]\\.nonce='[A-Za-z0-9+\\/=]{0,128}';)?";
const CF_LOADER_BODIES=[
  new RegExp("^var a=document\\.createElement\\('script'\\);"+CF_NONCE.replace('[a-z]','a')+"a\\.src='\\/cdn-cgi\\/challenge-platform\\/scripts\\/jsd\\/main\\.js';document\\.getElementsByTagName\\('head'\\)\\[0\\]\\.appendChild\\(a\\);$"),
  new RegExp("^\\(function\\(\\)\\{if\\(!document\\.body\\)return;var s=document\\.createElement\\('script'\\);"+CF_NONCE.replace('[a-z]','s')+"s\\.src='\\/cdn-cgi\\/challenge-platform\\/scripts\\/precursor\\/main\\.js';document\\.head\\.appendChild\\(s\\);\\}\\)\\(\\);$"),
  // Observed 2026-10-30 on real ekodi.kr Chromium: Cloudflare Precursor
  // normalizes URL origins before loading its own fixed same-origin script.
  // Only the exact grammar and EKODI-owned fallback origins are accepted.
  /^\(function\(\)\{if\(!document\.body\)return;var l=window\.location,o;try\{o=new URL\(l\.origin\)\.origin\}catch\(e\)\{try\{o=new URL\(new URL\(l\.href\)\.origin\)\.origin\}catch\(e\)\{o='https:\/\/(?:ekodi\.kr(?:\/edu)?\/?|edu\.ekodi\.kr\/?)'\}\}var u='\/cdn-cgi\/challenge-platform\/scripts\/precursor\/main\.js',s=document\.createElement\('script'\);s\.src=o\?new URL\(u,o\)\.href:u;document\.head\.appendChild\(s\);\}\)\(\);$/
];
const trustedInlineHashes=new Set();
export function cloudflareJsDetectionHashes(html){
  const out=[];
  for(const m of String(html||'').matchAll(CF_JSD_TAG)){
    if(!CF_LOADER_BODIES.some(re=>re.test(m[2])))continue;
    out.push(createHash('sha256').update(m[1],'utf8').digest('base64'));
  }
  return out;
}
export function trustCloudflareJsDetections(html){for(const h of cloudflareJsDetectionHashes(html))trustedInlineHashes.add(h);}
// Attach to a Playwright Page or BrowserContext: audits every served document (frames included).
export function observeCloudflareJsDetections(target){
  // Cloudflare may inject the narrowly audited detector into a nested iframe,
  // and that frame's response.text() promise can outlive the page's console
  // CSP violation. Keep all document audits pending until the strict verdict.
  const pending=new Set();
  target.on('response',response=>{
    try{if(response.request().resourceType()!=='document')return;}catch{return;}
    const audit=response.text().then(trustCloudflareJsDetections).catch(()=>{});
    pending.add(audit);
    void audit.finally(()=>pending.delete(audit));
  });
  return async function flushCloudflareJsDetectionAudits(){
    while(pending.size)await Promise.all([...pending]);
  };
}
const INLINE_SCRIPT_CSP=/^(?:Executing inline script violates the following Content Security Policy directive|Refused to execute inline script because it violates the following Content Security Policy directive:) ["']script-src 'self' https:\/\/cdn\.jsdelivr\.net https:\/\/ekodi\.kr["']\. Either the 'unsafe-inline' keyword, a hash \('sha256-([A-Za-z0-9+\/]{43}=)'\), or a nonce \('nonce-\.\.\.'\) is required to enable inline execution\.(?: The action has been blocked\.)?$/;
export function blockedInlineScriptHash(message){return INLINE_SCRIPT_CSP.exec(String(message||'').trim())?.[1]||null;}
export function classifyConsoleSecurityBlock(message){
  const value=String(message||'').trim();
  // Chromium 156 updated its CSP console wording. Match only the exact,
  // previously observed Education/Shell policy and blocked third-party beacon;
  // never relax the browser CSP or classify unrelated violations as benign.
  const legacyInline = value.startsWith('Refused to apply inline style because it violates the following Content Security Policy directive: "style-src ');
  const modernInline = value.startsWith('Applying inline style violates the following Content Security Policy directive ');
  const knownInlineStyle = legacyInline || modernInline;
  if(knownInlineStyle
      && value.includes("style-src 'self' https://ekodi.kr https://ekodi.kr/shell")
      && value.includes("Either the 'unsafe-inline' keyword")
      && value.includes("nonce (")
      && (legacyInline ? value.includes("required to enable inline execution") : value.includes("The action has been blocked"))){
    return 'inline-style-rejected-by-strict-CSP';
  }
  const legacyBeacon=value.startsWith("Refused to load the script '"+BEACON_PREFIX);
  const modernBeacon=value.startsWith("Loading the script '"+BEACON_PREFIX);
  const knownBeacon=legacyBeacon || modernBeacon;
  if(knownBeacon
      && value.includes('violates the following Content Security Policy directive')
      && value.includes("script-src 'self' https://cdn.jsdelivr.net https://ekodi.kr")
      && (legacyBeacon ? value.includes("script-src-elem") : value.includes("The action has been blocked"))){
    return 'unapproved-cloudflare-beacon-blocked-by-CSP';
  }
  if(value==='Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector')
    return 'read-only-probe-blocked-network-mutation';
  // Shape only here (the report can precede the document body); verifyKnownSecurityBlocks requires the hash.
  if(blockedInlineScriptHash(value))return 'cloudflare-js-detection-blocked-by-CSP';
  return null;
}
export function classifyRequestSecurityBlock(url,failure){
  const address=String(url||'');
  const error=String(failure||'').trim();
  if(address.startsWith(BEACON_PREFIX)&&error==='csp')return 'unapproved-cloudflare-beacon-blocked-by-CSP';
  if(address===TELEMETRY_URL&&error==='net::ERR_BLOCKED_BY_CLIENT.Inspector')return 'read-only-probe-blocked-network-mutation';
  return null;
}
export function classifyMutationSecurityBlock(method,url){
  if(String(method||'').toUpperCase()==='POST'&&String(url||'')===TELEMETRY_URL)
    return 'read-only-probe-blocked-network-mutation';
  return null;
}
export function verifyKnownSecurityBlocks({consoleBlocks=[],requestBlocks=[],mutations=[]}={}){
  // A generic blocked-resource console line is accepted only when our
  // read-only interceptor actually aborted the exact telemetry POST.
  const generic=consoleBlocks.filter(x=>x.message==='Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector');
  const telemetry=mutations.filter(x=>classifyMutationSecurityBlock(x.method,x.url)!==null);
  if(generic.length>telemetry.length)return {ok:false,reason:'unattributed-blocked-resource-message'};
  if(mutations.some(x=>!classifyMutationSecurityBlock(x.method,x.url)))
    return {ok:false,reason:'unexpected-mutating-request'};
  if(consoleBlocks.some(x=>!classifyConsoleSecurityBlock(x.message)))
    return {ok:false,reason:'unexpected-console-error'};
  const inline=consoleBlocks.map(x=>blockedInlineScriptHash(x.message)).filter(Boolean);
  if(inline.some(h=>!trustedInlineHashes.has(h)))
    return {ok:false,reason:'blocked-inline-script-not-an-audited-cloudflare-js-detection'};
  if(requestBlocks.some(x=>!classifyRequestSecurityBlock(x.url,x.failure)))
    return {ok:false,reason:'unexpected-failed-network-request'};
  return {ok:true,reason:'known-security-blocks-observed-and-enforced'};
}
