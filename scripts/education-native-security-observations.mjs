// Explicitly observed, narrowly classified browser security blocks.
// These are still recorded as CSP/privacy evidence, never bypassed, never used
// to suppress unexpected network, JavaScript, HTTP, navigation or lesson failures.
export const TELEMETRY_URL='https://ekodi.kr/api/telemetry/visit';
export const BEACON_PREFIX='https://static.cloudflareinsights.com/beacon.min.js/';
export function classifyConsoleSecurityBlock(message){
  const value=String(message||'').trim();
  if(value.startsWith('Refused to apply inline style because it violates the following Content Security Policy directive: "style-src ')
      && value.includes("style-src 'self' https://ekodi.kr https://ekodi.kr/shell")
      && value.includes('Either the ')
      && value.includes('nonce')){
    return 'inline-style-rejected-by-strict-CSP';
  }
  if(value.startsWith("Refused to load the script '"+BEACON_PREFIX)
      && value.includes('because it violates the following Content Security Policy directive: ')
      && value.includes("script-src 'self' https://cdn.jsdelivr.net https://ekodi.kr")){
    return 'unapproved-cloudflare-beacon-blocked-by-CSP';
  }
  if(value==='Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector')
    return 'read-only-probe-blocked-network-mutation';
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
  if(requestBlocks.some(x=>!classifyRequestSecurityBlock(x.url,x.failure)))
    return {ok:false,reason:'unexpected-failed-network-request'};
  return {ok:true,reason:'known-security-blocks-observed-and-enforced'};
}
