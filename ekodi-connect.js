// EKODI Connect — provider-neutral connector core.
// One source of truth for (1) which external AI clients may connect to the EKODI MCP gateway,
// (2) which tools each client class may see/call, and (3) how a connector's live OAuth
// discovery is judged ready. Reused by the MCP gateway, mcp-client-policy, the production
// verification workflow, tests and (P1) the admin "내 연결 관리" ledger.
// Adding a new AI provider = adding one registry row; no gateway code change.

export const EKODI_CONNECT_VERSION='1.0.0';
export const EKODI_CONNECT_RESOURCE='https://ekodi.kr/mcp';

// Tools that can change task state irreversibly or act as the Platform Super Administrator.
export const PRIVILEGED_MCP_TOOLS=Object.freeze(['approve_task']);

export const TOOL_EXPOSURE_PROFILES=Object.freeze({
  // Full surface, unchanged legacy behavior for already-approved clients.
  'full':Object.freeze({id:'full',deny:Object.freeze([])}),
  // External assistants submit and observe work; Human Gate approval stays inside EKODI.
  'external-assistant':Object.freeze({id:'external-assistant',deny:PRIVILEGED_MCP_TOOLS}),
});

const CLAUDE_HOSTED_CALLBACK='https://claude.ai/api/mcp/auth_callback';

// status: supported | supported-with-registered-oauth-metadata | planned
export const EKODI_CONNECT_CLIENT_CLASSES=Object.freeze([
  Object.freeze({id:'chatgpt',provider:'openai',kind:'interactive-assistant',status:'supported',toolProfile:'full'}),
  Object.freeze({id:'openai-responses-api',provider:'openai',kind:'api-runtime',status:'supported-with-registered-oauth-metadata',toolProfile:'full'}),
  Object.freeze({id:'openai-agents-api',provider:'openai',kind:'agent-runtime',status:'supported-with-registered-oauth-metadata',toolProfile:'full'}),
  Object.freeze({id:'openai-codex',provider:'openai',kind:'coding-agent',status:'supported-with-registered-oauth-metadata',toolProfile:'full'}),
  Object.freeze({id:'claude-hosted',provider:'anthropic',kind:'interactive-assistant',status:'supported-with-registered-oauth-metadata',toolProfile:'external-assistant',
    surfaces:Object.freeze(['claude.ai','claude-desktop','claude-mobile','cowork']),
    registration:'pre-registered',redirectUris:Object.freeze([CLAUDE_HOSTED_CALLBACK])}),
  Object.freeze({id:'claude-code',provider:'anthropic',kind:'coding-agent',status:'planned',toolProfile:'external-assistant',
    registration:'pre-registered',redirectUris:Object.freeze(['http://127.0.0.1/callback','http://localhost/callback']),loopbackAnyPort:true}),
  Object.freeze({id:'generic-mcp-oauth',provider:'provider-neutral',kind:'mcp-client',status:'supported-with-registered-oauth-metadata',toolProfile:'full'}),
  // Any OAuth client not explicitly bound (e.g. created by dynamic registration) gets least privilege.
  Object.freeze({id:'unregistered-mcp-oauth',provider:'provider-neutral',kind:'mcp-client',status:'supported',toolProfile:'external-assistant'}),
]);

export const UNREGISTERED_CLIENT_CLASS='unregistered-mcp-oauth';
const CLASS_BY_ID=new Map(EKODI_CONNECT_CLIENT_CLASSES.map(item=>[item.id,item]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientClassBound(classId,env={}){
  return Object.values(parseClientClassMap(env?.EKODI_MCP_CLIENT_CLASS_MAP)).includes(String(classId||''));
}
export function connectClientClass(id){return CLASS_BY_ID.get(String(id||''))||null}

// OAuth client ids are public identifiers, not secrets. The binding of a registered client id
// to a class lives in env EKODI_MCP_CLIENT_CLASS_MAP as JSON {"<client uuid>":"claude-hosted"}.
export function parseClientClassMap(raw){
  let value=raw;
  if(typeof value==='string'){try{value=JSON.parse(value)}catch{return Object.freeze({})}}
  if(!value||typeof value!=='object'||Array.isArray(value))return Object.freeze({});
  const out={};
  for(const [clientId,classId] of Object.entries(value)){
    const key=String(clientId).trim().toLowerCase();
    if(UUID.test(key)&&CLASS_BY_ID.has(String(classId)))out[key]=String(classId);
  }
  return Object.freeze(out);
}

export function resolveConnectClientClass(clientId,env={}){
  const key=String(clientId||'').trim().toLowerCase();
  if(!key)return UNREGISTERED_CLIENT_CLASS;
  return parseClientClassMap(env?.EKODI_MCP_CLIENT_CLASS_MAP)[key]||UNREGISTERED_CLIENT_CLASS;
}

function profileFor(classId){
  const cls=connectClientClass(classId);
  return TOOL_EXPOSURE_PROFILES[cls?.toolProfile]||TOOL_EXPOSURE_PROFILES['external-assistant'];
}
export function isToolExposedToClient(toolName,classId){
  return !profileFor(classId).deny.includes(String(toolName||''));
}
export function filterToolsForClient(tools=[],classId){
  return tools.filter(tool=>isToolExposedToClient(tool?.name,classId));
}

// ---------- Connector readiness (reusable by CI, admin and any future AI provider) ----------

function parseChallenge(header){
  const value=String(header||'');
  if(!/^\s*bearer\b/i.test(value))return null;
  const params={};
  for(const m of value.matchAll(/([a-z_]+)="([^"]*)"/gi))params[m[1].toLowerCase()]=m[2];
  return params;
}

export function authorizationServerMetadataUrls(issuer){
  let url;
  try{url=new URL(String(issuer))}catch{return []}
  const path=url.pathname.replace(/\/$/,'');
  const origin=url.origin;
  return [...new Set([
    `${origin}/.well-known/oauth-authorization-server${path}`,
    `${origin}/.well-known/openid-configuration${path}`,
    `${origin}${path}/.well-known/oauth-authorization-server`,
    `${origin}${path}/.well-known/openid-configuration`,
  ])];
}

// critical = blocks every MCP OAuth client; advisory = specific clients may fail.
export function assessConnectorReadiness({expectedResource=EKODI_CONNECT_RESOURCE,unauthStatus,challengeHeader,resourceMetadata,authServerMetadata,clientClass='claude-hosted',clientBound=false}={}){
  const checks=[];
  const add=(id,level,ok,detail)=>checks.push(Object.freeze({id,level,ok:!!ok,detail}));
  const challenge=parseChallenge(challengeHeader);
  add('unauthenticated_401','critical',Number(unauthStatus)===401,`status=${unauthStatus}`);
  add('challenge_resource_metadata','critical',!!challenge?.resource_metadata,challenge?.resource_metadata||'missing');
  add('resource_exact_match','critical',resourceMetadata?.resource===expectedResource,String(resourceMetadata?.resource||'missing'));
  const issuer=Array.isArray(resourceMetadata?.authorization_servers)?resourceMetadata.authorization_servers[0]:null;
  add('authorization_server_listed','critical',!!issuer,issuer||'missing');
  add('authorization_server_metadata','critical',!!authServerMetadata?.authorization_endpoint&&!!authServerMetadata?.token_endpoint,authServerMetadata?.issuer||'unreachable');
  const methods=authServerMetadata?.code_challenge_methods_supported;
  add('pkce_s256_advertised','advisory',Array.isArray(methods)&&methods.includes('S256'),Array.isArray(methods)?methods.join(','):'not advertised');
  const cls=connectClientClass(clientClass);
  const hasRegistration=!!authServerMetadata?.registration_endpoint;
  const cimd=authServerMetadata?.client_id_metadata_document_supported===true&&(authServerMetadata?.token_endpoint_auth_methods_supported||[]).includes('none');
  const bound=cls?.registration==='pre-registered'&&clientBound===true;
  add('client_identification','advisory',bound||hasRegistration||cimd,
    bound?'pre-registered client id bound':hasRegistration?'dcr (registration_endpoint)':cimd?'cimd':'none');
  // RFC 8414 §2: absent grant_types_supported means ["authorization_code","implicit"].
  const grants=authServerMetadata?.grant_types_supported||['authorization_code','implicit'];
  add('refresh_supported','advisory',grants.includes('refresh_token'),grants.join(','));
  const critical=checks.filter(c=>c.level==='critical');
  return Object.freeze({
    version:EKODI_CONNECT_VERSION,clientClass,
    ready:critical.every(c=>c.ok),
    fullyReady:checks.every(c=>c.ok),
    checks:Object.freeze(checks),
  });
}

export async function probeConnectorReadiness({resource=EKODI_CONNECT_RESOURCE,clientClass='claude-hosted',clientBound=false,fetchImpl=fetch,timeoutMs=10000}={}){
  // Headers and body share one deadline so a stalled body cannot hang the probe.
  const get=async(url,init={})=>{
    const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const res=await fetchImpl(url,{...init,signal:ctl.signal});
      const body=res?.ok?await res.json().catch(()=>null):null;
      return {status:res?.status??0,ok:!!res?.ok,headers:res?.headers,body};
    }catch{return null}finally{clearTimeout(t)}
  };
  const unauth=await get(resource,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'submit_task',arguments:{intent:'connector readiness probe'}}})});
  const challengeHeader=unauth?.headers?.get?.('www-authenticate')||'';
  const metaUrl=parseChallenge(challengeHeader)?.resource_metadata||`${new URL(resource).origin}/.well-known/oauth-protected-resource`;
  const metaRes=await get(metaUrl);
  const resourceMetadata=metaRes?.ok?metaRes.body:null;
  let authServerMetadata=null;
  for(const url of authorizationServerMetadataUrls(resourceMetadata?.authorization_servers?.[0])){
    const res=await get(url);
    if(res?.ok&&res.body){authServerMetadata=res.body;break}
  }
  return assessConnectorReadiness({expectedResource:resource,unauthStatus:unauth?.status??0,challengeHeader,resourceMetadata,authServerMetadata,clientClass,clientBound});
}
