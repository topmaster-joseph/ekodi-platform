// EKODI-LOCAL-SITE-VAULT-001
// Pure contract only: never receives or handles credentials, cookies or browser profiles.
// The actual encrypted profile must remain in the signed-in Windows user's DPAPI scope.
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

const PUBLIC_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const BLOCKED_TLD = /\.(?:local|localhost|internal|test|invalid|example|onion|lan|home|corp)$/i;
const BLOCKED_HOST = /^(?:localhost|metadata|metadata\.google\.internal)$/i;
const ACTIONS = new Set(['register','open','list','delete']);

export function normalizePublicHttpsSite(value){
  // No fragments, query tokens or embedded basic-auth credentials may ever be
  // copied into a persistent site record or logged as a URL.
  if(typeof value!=='string'||!value.trim()||value.length>2048||/[\x00-\x20\x7f]/.test(value.trim()))
    return Object.freeze({ok:false,code:'SITE_VAULT_URL_INVALID'});
  let url;
  try{url=new URL(value.trim())}catch{return Object.freeze({ok:false,code:'SITE_VAULT_URL_INVALID'})}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port)
    return Object.freeze({ok:false,code:'SITE_VAULT_PUBLIC_HTTPS_REQUIRED'});
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host||host.length>253||isIP(host)!==0||!PUBLIC_HOST.test(host)||BLOCKED_TLD.test(host)||BLOCKED_HOST.test(host)||host.includes('..'))
    return Object.freeze({ok:false,code:'SITE_VAULT_PUBLIC_DNS_REQUIRED'});
  if(url.hostname!==host&&url.hostname!==host+'.')
    return Object.freeze({ok:false,code:'SITE_VAULT_HOST_INVALID'});
  const origin='https://'+host;
  const startUrl=origin+(url.pathname||'/');
  const siteId=createHash('sha256').update(origin,'utf8').digest('hex');
  return Object.freeze({ok:true,origin,startUrl,hostname:host,siteId});
}

export function planLocalSiteVaultIntent(request={},env={}){
  const action=String(request.action||'');
  if(!ACTIONS.has(action))return Object.freeze({ok:false,code:'SITE_VAULT_ACTION_UNSUPPORTED'});
  if(request.automatic===true||request.unattended===true||request.readCredentials===true||
     request.exportCookies===true||request.injectPassword===true||request.pay===true||
     request.purchase===true||request.mutateAccount===true||
     request.kind==='server-agent'||request.source==='cloud'||request.source==='mcp')
    return Object.freeze({ok:false,code:'SITE_VAULT_PRIVILEGED_ACTION_FORBIDDEN'});
  if(env.windowsInteractiveUser!==true||env.localDpapiAvailable!==true)
    return Object.freeze({ok:false,code:'SITE_VAULT_LOCAL_WINDOWS_USER_REQUIRED'});
  if(action==='list')return Object.freeze({ok:true,action:'LIST_LOCAL_SITE_LABELS',provider:'ekodi-native-local',secretExport:false});
  const site=normalizePublicHttpsSite(request.site);
  if(!site.ok)return site;
  if(['register','delete','open'].includes(action)&&env.userPresentConsent!==true)
    return Object.freeze({ok:false,code:'SITE_VAULT_LOCAL_CONSENT_REQUIRED'});
  if(action==='register'&&request.rememberPasswords===true&&env.nativeBrowserPasswordSaveConsent!==true)
    return Object.freeze({ok:false,code:'SITE_VAULT_PASSWORD_MANAGER_CONSENT_REQUIRED'});
  return Object.freeze({
    ok:true,
    action:action==='register'?'REGISTER_LOCAL_SITE_PROFILE':action==='open'?'OPEN_LOCAL_SITE_PROFILE':'DELETE_LOCAL_SITE_PROFILE',
    provider:'ekodi-native-local',siteId:site.siteId,origin:site.origin,
    rememberPasswords:action==='register'&&request.rememberPasswords===true,
    secretExport:false,serverSync:false,credentialsRelay:false,automaticLoginInput:false,
    thirdPartyBrowserProfileReuse:false,requiresLocalUser:true,
  });
}

export function redactSiteVaultReceipt(raw={}){
  return Object.freeze({
    policyId:'EKODI-LOCAL-SITE-VAULT-001',
    action:['register','open','delete','list'].includes(raw.action)?raw.action:'unknown',
    outcome:['allowed','denied','failed'].includes(raw.outcome)?raw.outcome:'failed',
    localOnly:true,
    secretExported:false,
    sessionCookieExported:false,
    passwordValueReturned:false,
  });
}
