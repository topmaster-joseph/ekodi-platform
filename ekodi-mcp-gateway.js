import { userAiStatusForIdentity } from './user-ai-control.js';
import { membershipPortfolioForIdentity } from './universal-membership.js';
import { buildPersonalAiBridgeSnapshot, resolveCanonicalEkodiIdentity } from './personal-ai-bridge.js';
import { authorizeCapabilityInvocation, SOVEREIGN_CAPABILITY_FABRIC } from './sovereign-capability-fabric.js';
import { buildCoreAiGateway } from './core-ai-gateway.js';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
export const EKODI_MCP_RESOURCE='https://ekodi.kr/mcp';
export const EKODI_MCP_LEGACY_RESOURCES=Object.freeze(['https://api.ekodi.kr/mcp']);
const ACCEPTED_MCP_RESOURCES=Object.freeze([EKODI_MCP_RESOURCE,...EKODI_MCP_LEGACY_RESOURCES]);
export const EKODI_MCP_AUTH_SERVER=`${SUPABASE_URL}/auth/v1`;
export const EKODI_MCP_METADATA_URL='https://ekodi.kr/.well-known/oauth-protected-resource';
const PROTOCOL_VERSION='2026-07-28';
const OAUTH_SCHEME=Object.freeze({type:'oauth2',scopes:['openid','email','profile']});
const TOOL_CAPABILITIES=Object.freeze({
  ekodi_my_identity:'identity.self.read',
  ekodi_my_ai_status:'ai.personal.status.read',
  ekodi_my_services:'services.membership.read',
  ekodi_delegate_command:'ai.command.delegate',
});

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers,
  }});
}
function mcpResponseHeaders(request,headers={}){
  const host=(()=>{try{return new URL(request.url).hostname.toLowerCase()}catch{return ''}})();
  return {
    link:`<${EKODI_MCP_RESOURCE}>; rel="canonical"`,
    'x-ekodi-mcp-resource':EKODI_MCP_RESOURCE,
    ...(host==='api.ekodi.kr'?{'x-ekodi-mcp-legacy-endpoint':'true'}:{}),
    ...headers,
  };
}
function mcpJson(request,data,status=200,headers={}){return json(data,status,mcpResponseHeaders(request,headers))}
function mcpEmpty(request,status=202,headers={}){return new Response(null,{status,headers:mcpResponseHeaders(request,headers)})}
function bearerToken(request){
  const value=String(request.headers.get('authorization')||'');
  return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():'';
}
function base64UrlJson(segment){
  const normalized=String(segment||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0))));
}
export function mcpProtectedResourceMetadata(){
  return Object.freeze({
    resource:EKODI_MCP_RESOURCE,
    resource_name:'EKODI MCP Gateway',
    authorization_servers:[EKODI_MCP_AUTH_SERVER],
    scopes_supported:['openid','email','profile'],
    bearer_methods_supported:['header'],
    resource_documentation:'https://ekodi.kr/auth/oauth/consent',
  });
}

export async function validateMcpBearer(request,{fetchImpl=fetch}={}){
  const token=bearerToken(request);
  if(!token)return {ok:false,reason:'missing_token'};
  let claims={};
  try{claims=base64UrlJson(token.split('.')[1]);}catch{return {ok:false,reason:'malformed_token'}}
  const response=await fetchImpl(`${SUPABASE_URL}/auth/v1/user`,{headers:{
    apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`,
  }}).catch(()=>null);
  if(!response?.ok)return {ok:false,reason:'invalid_token'};
  const user=await response.json();
  const audience=(Array.isArray(claims.aud)?claims.aud:[claims.aud]).filter(Boolean).map(String);
  if(!claims.client_id)return {ok:false,reason:'oauth_client_required'};
  const resourceAudience=ACCEPTED_MCP_RESOURCES.find(resource=>audience.includes(resource));
  if(!resourceAudience)return {ok:false,reason:'invalid_audience'};
  if(String(claims.sub||'')!==String(user?.id||''))return {ok:false,reason:'subject_mismatch'};
  return {ok:true,token,user,claims,resourceAudience,legacyAudience:resourceAudience!==EKODI_MCP_RESOURCE};
}
export const EKODI_MCP_TOOLS=Object.freeze([
  Object.freeze({
    name:'ekodi_bridge_status',
    title:'EKODI Personal AI Bridge 상태',
    description:'Use this when you need the public EKODI Personal AI Bridge and routing contract without personal data.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},
    securitySchemes:[{type:'noauth'}],
  }),
  Object.freeze({
    name:'ekodi_my_identity',
    title:'내 EKODI ID 확인',
    description:'Use this when the signed-in user wants to resolve the current OAuth login to the canonical EKODI identity.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},
    securitySchemes:[OAUTH_SCHEME],
    ekodiCapability:'identity.self.read',
  }),
  Object.freeze({
    name:'ekodi_my_ai_status',
    title:'내 EKODI AI 상태',
    description:'Use this when the signed-in user wants to inspect Personal AI routing, plan limits, and connected AI providers.',
    inputSchema:{type:'object',properties:{site:{type:'string',default:'my'}},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},
    securitySchemes:[OAUTH_SCHEME],
    ekodiCapability:'ai.personal.status.read',
  }),
  Object.freeze({
    name:'ekodi_my_services',
    title:'내 EKODI 서비스 확인',
    description:'Use this when the signed-in user wants to see EKODI services and their current membership state.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},
    securitySchemes:[OAUTH_SCHEME],
    ekodiCapability:'services.membership.read',
  }),
  Object.freeze({
    name:'ekodi_delegate_command',
    title:'EKODI AI Command Delegation',
    description:'Use this when the signed-in user wants EKODI AI to coordinate configured AI providers, synthesize specialist evidence, and independently verify the result before ChatGPT continues. This delegates AI collaboration only and does not grant external system permissions or perform privileged side effects.',
    inputSchema:{
      type:'object',
      properties:{
        goal:{type:'string',minLength:1,maxLength:1200},
        risk:{type:'string',enum:['low','normal','high','critical'],default:'normal'},
        target:{type:'object',properties:{
          workspaceId:{type:'string',maxLength:120},
          workspaceSlug:{type:'string',maxLength:120},
          service:{type:'string',maxLength:120},
          capability:{type:'string',maxLength:160},
          surface:{type:'string',maxLength:80},
        },additionalProperties:false},
      },
      required:['goal'],
      additionalProperties:false,
    },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true,idempotentHint:false},
    securitySchemes:[OAUTH_SCHEME],
    ekodiCapability:'ai.command.delegate',
  }),
]);

function textResult(text,structuredContent={},meta={}){
  return {content:[{type:'text',text}],structuredContent,_meta:meta};
}
function authChallenge(reason='invalid_token'){
  const challenge=`Bearer resource_metadata="${EKODI_MCP_METADATA_URL}", error="${reason}"`;
  return textResult('EKODI 계정 연결이 필요합니다.',{authenticated:false},{'mcp/www_authenticate':[challenge]});
}
function rpcResult(id,result){return {jsonrpc:'2.0',id,result}}
function rpcError(id,code,message,data){return {jsonrpc:'2.0',id,error:{code,message,...(data?{data}: {})}}}

async function internalJson(response){
  if(!response)return null;
  try{return await response.json()}catch{return null}
}
async function requireMcpIdentity(request,dependencies={}){
  const auth=await validateMcpBearer(request,dependencies);
  if(!auth.ok)return {error:authChallenge(auth.reason)};
  const identity=await resolveCanonicalEkodiIdentity({
    token:auth.token,authUser:{id:auth.user.id,email:auth.user.email},fetchImpl:dependencies.fetchImpl||fetch,oauthMcp:true,
  });
  if(identity?.authorized!==true)return {error:authChallenge('insufficient_mcp_authorization')};
  if(!identity?.canonical)return {error:textResult('EKODI ID 연결을 완료한 뒤 다시 시도해 주세요.',{authenticated:true,canonical:false})};
  return {auth,identity};
}

function bearerRequest(url,token,options={}){
  const headers=new Headers(options.headers||{});headers.set('authorization',`Bearer ${token}`);
  return new Request(url,{...options,headers});
}
function sanitizeAiStatus(data={}){
  const {account,...rest}=data||{};
  return {...rest,account:{ekodiId:account?.ekodiId||null}};
}
function sanitizePortfolio(data={}){
  const {account,...rest}=data||{};
  return {...rest,account:{ekodiId:account?.ekodiId||null,defaultTier:account?.defaultTier||'free'}};
}

export async function callEkodiMcpTool(name,args,request,env,dependencies={}){
  if(name==='ekodi_bridge_status')return textResult('EKODI Personal AI Bridge는 Sovereign Capability Fabric을 통해 AI Router와 MCP를 양방향으로 연결합니다.',{
    active:true,
    providerIndependent:true,
    fabric:SOVEREIGN_CAPABILITY_FABRIC,
    forward:'ekodi-ai-router',
    reverse:'ekodi-mcp-adapter',
    firstExternalConnectionRequiresConsent:true,
  });
  const resolved=await requireMcpIdentity(request,dependencies);
  if(resolved.error)return resolved.error;
  const {auth,identity}=resolved;
  const capabilityId=TOOL_CAPABILITIES[name];
  if(!capabilityId)return textResult('등록되지 않은 EKODI 도구입니다.',{error:'TOOL_NOT_FOUND'});
  const authorization=authorizeCapabilityInvocation({
    capabilityId,
    channel:'mcp',
    trustTier:dependencies.trustTier||'approved_external',
    personId:identity.personId,
    workspaceId:'personal',
    role:'member',
  });
  if(!authorization.allowed)return textResult('이 EKODI 기능은 현재 MCP에서 사용할 수 없습니다.',{error:'CAPABILITY_DENIED',reason:authorization.reason,capabilityId});
  if(name==='ekodi_delegate_command'){
    const goal=String(args?.goal||'').trim().slice(0,1200);
    if(!goal)return textResult('EKODI AI command goal is required.',{error:'GOAL_REQUIRED'});
    const requestedRisk=String(args?.risk||'normal').trim().toLowerCase();
    const risk=['low','normal','high','critical'].includes(requestedRisk)?requestedRisk:'normal';
    const target=args?.target&&typeof args.target==='object'?args.target:{};
    const gateway=dependencies.coreAiGateway||buildCoreAiGateway(env,[]);
    const result=await gateway.command({
      taskId:`mcp_${Date.now()}`,
      taskName:'mcp-delegated-command',
      goal,
      risk,
      target,
      context:Object.freeze({source:'chatgpt-mcp',channel:'mcp',canonicalIdentity:true,authorityTransfer:false}),
    });
    const humanGateRequired=risk==='high'||risk==='critical';
    const data={
      delegated:true,executor:'ekodi-v8',providerIndependent:true,
      sideEffectsPerformed:false,authorityTransferred:false,externalExecutionAuthorized:false,
      humanGateRequiredForExternalExecution:humanGateRequired,collaboration:result,
    };
    const summary=result?.state==='verified'
      ?'EKODI AI completed multi-provider collaboration and independent verification.'
      :result?.state==='degraded'
        ?'EKODI AI collaborated, but one or more providers or independent verification are degraded.'
        :'EKODI Core returned a safe non-AI or limited-mode result.';
    return textResult(summary,data);
  }
  if(name==='ekodi_my_identity'){
    const bridge=buildPersonalAiBridgeSnapshot(identity,{mcpConnected:true});
    const data={ekodiId:identity.ekodiId,canonical:true,providerIndependent:true,bridge};
    return textResult(`현재 연결된 EKODI ID는 ${identity.ekodiId}입니다.`,data);
  }
  if(name==='ekodi_my_ai_status'){
    const site=String(args?.site||'my').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'my';
    const response=await userAiStatusForIdentity(new Request(`https://api.ekodi.kr/api/user-ai/status?site=${encodeURIComponent(site)}`),env,identity);
    const data=sanitizeAiStatus(await internalJson(response));
    if(!response?.ok)return textResult('EKODI AI 상태를 불러오지 못했습니다.',{error:data?.code||'USER_AI_STATUS_FAILED'});
    return textResult('개인 AI 라우팅과 연결 상태를 확인했습니다.',data);
  }
  if(name==='ekodi_my_services'){
    const response=await membershipPortfolioForIdentity(new Request('https://api.ekodi.kr/api/membership/portfolio'),env,identity);
    const data=sanitizePortfolio(await internalJson(response));
    if(!response?.ok)return textResult('EKODI 서비스 상태를 불러오지 못했습니다.',{error:data?.code||'MEMBERSHIP_STATUS_FAILED'});
    return textResult('현재 이용 가능한 EKODI 서비스와 멤버십 상태를 확인했습니다.',data);
  }
  return textResult('등록되지 않은 EKODI 도구입니다.',{error:'TOOL_NOT_FOUND'});
}
async function handleRpc(message,request,env,dependencies={}){
  const id=message?.id??null;
  const method=String(message?.method||'');
  if(method==='server/discover')return rpcResult(id,{
    supportedVersions:[PROTOCOL_VERSION],
    capabilities:{tools:{listChanged:false}},
    instructions:'Use EKODI capabilities only for the signed-in user and within the declared Capability Fabric contract.',
    ttlMs:300000,
    cacheScope:'public',
    resource:EKODI_MCP_RESOURCE,
    fabric:SOVEREIGN_CAPABILITY_FABRIC,
    _meta:{'io.modelcontextprotocol/serverInfo':{name:'ekodi-sovereign-capability-fabric',version:'2026-09-09.1'}},
  });
  if(method==='initialize')return rpcResult(id,{
    protocolVersion:'2025-06-18',
    capabilities:{tools:{listChanged:false}},
    serverInfo:{name:'ekodi-sovereign-capability-fabric',version:'2026-09-09.1'},
    instructions:'Legacy compatibility. Modern clients should use MCP 2026-07-28 server/discover.',
  });
  if(method==='ping')return rpcResult(id,{});
  if(method==='tools/list')return rpcResult(id,{tools:EKODI_MCP_TOOLS,ttlMs:300000,cacheScope:'public'});
  if(method==='tools/call'){
    const name=String(message?.params?.name||'');
    const result=await callEkodiMcpTool(name,message?.params?.arguments||{},request,env,dependencies);
    return rpcResult(id,result);
  }
  if(method.startsWith('notifications/'))return null;
  return rpcError(id,-32601,'Method not found');
}

export function handleEkodiMcpMetadata(request){
  if(request.method!=='GET'&&request.method!=='HEAD')return mcpJson(request,{error:'method_not_allowed'},405,{allow:'GET, HEAD'});
  return mcpJson(request,mcpProtectedResourceMetadata());
}
export async function handleEkodiMcpGateway(request,env,dependencies={}){
  if(request.method==='GET')return mcpJson(request,{error:'streaming_get_not_supported',transport:'stateless-streamable-http'},405,{allow:'POST'});
  if(request.method!=='POST')return mcpJson(request,{error:'method_not_allowed'},405,{allow:'POST'});
  let payload=null;
  try{payload=await request.json()}catch{return mcpJson(request,rpcError(null,-32700,'Parse error'),400)}
  if(Array.isArray(payload)){
    const output=(await Promise.all(payload.map(item=>handleRpc(item,request,env,dependencies)))).filter(Boolean);
    return output.length?mcpJson(request,output):mcpEmpty(request,202);
  }
  const result=await handleRpc(payload,request,env,dependencies);
  return result?mcpJson(request,result):mcpEmpty(request,202);
}
