// Shared pure release assertion. An explicit no-store directive is required
// regardless of whether browsers/proxies add 'private' or other cache directives.
export const NO_STORE_DIRECTIVE_MARKER='cache-control: <no-store-directive>';
export function releaseHeaderMatches(headers,marker){
  if(marker===NO_STORE_DIRECTIVE_MARKER){
    const raw=String(headers?.get?.('cache-control')||'');
    return raw.split(',').some(directive=>directive.trim().toLowerCase()==='no-store');
  }
  const normalized=[...(headers?.entries?.()||[])].map(([key,value])=>String(key)+': '+String(value)).join('\n').toLowerCase();
  return normalized.includes(String(marker||'').toLowerCase());
}
