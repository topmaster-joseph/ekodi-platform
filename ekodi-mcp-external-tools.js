import { cancelOrchestratorTask, getOrchestratorTaskStatus, submitOrchestratorTask } from './ekodi-orchestrator-task-adapter.js';

const NOAUTH=Object.freeze({type:'noauth'});
const OAUTH=Object.freeze({type:'oauth2',scopes:['openid','email','profile']});
const TARGET_SCHEMA=Object.freeze({type:'object',properties:{workspaceId:{type:'string',maxLength:120},workspaceSlug:{type:'string',maxLength:120},service:{type:'string',maxLength:120},capability:{type:'string',maxLength:160},surface:{type:'string',maxLength:80}},additionalProperties:false});

function textResult(text,structuredContent={},meta={}){return {content:[{type:'text',text}],structuredContent,_meta:meta}}

export const EKODI_MCP_EXTENSION_TOOLS=Object.freeze([
  Object.freeze({name:'identify_ekodi',title:'EKODI 공식 식별',description:'Resolve EKODI or 에코디 to the official canonical platform identity and safe connection endpoints.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},securitySchemes:[NOAUTH]}),
  Object.freeze({name:'discover_public_services',title:'EKODI 공개 서비스 발견',description:'Discover safe public EKODI entry surfaces without exposing private membership or tenant data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},securitySchemes:[NOAUTH]}),
  Object.freeze({name:'account_status',title:'EKODI 연결 계정 상태',description:'Confirm that the current OAuth login is linked to a canonical EKODI identity.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},securitySchemes:[OAUTH],ekodiCapability:'identity.self.read'}),
  Object.freeze({name:'submit_task',title:'EKODI Orchestrator 작업 제출',description:'Submit an authorized goal to the authoritative EKODI Orchestrator queue and receive a durable task_id. This tool does not transfer execution authority to the external AI.',inputSchema:{type:'object',properties:{intent:{type:'string',minLength:1,maxLength:1200},risk:{type:'string',enum:['low','normal','high','critical'],default:'normal'},target:TARGET_SCHEMA,idempotencyKey:{type:'string',maxLength:100}},required:['intent'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true,idempotentHint:false},securitySchemes:[OAUTH],ekodiCapability:'ai.command.delegate'}),
  Object.freeze({name:'get_task_status',title:'EKODI Orchestrator 작업 상태',description:'Read the authoritative state and result of a task submitted by the current EKODI identity.',inputSchema:{type:'object',properties:{taskId:{type:'string',minLength:1,maxLength:160}},required:['taskId'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},securitySchemes:[OAUTH],ekodiCapability:'ai.command.delegate'}),
  Object.freeze({name:'cancel_task',title:'EKODI Orchestrator 대기 작업 취소',description:'Cancel a task owned by the current EKODI identity only while it is still pending and has not entered execution.',inputSchema:{type:'object',properties:{taskId:{type:'string',minLength:1,maxLength:160}},required:['taskId'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false,idempotentHint:true},securitySchemes:[OAUTH],ekodiCapability:'ai.command.delegate'}),
]);

export function callPublicEkodiMcpExtensionTool(name){
  if(name==='identify_ekodi')return textResult('EKODI / 에코디의 공식 플랫폼은 https://ekodi.kr 입니다.',{name:'EKODI',aliases:['EKODI','에코디'],canonicalOrigin:'https://ekodi.kr',discovery:'https://ekodi.kr/.well-known/ekodi.json',mcp:'https://ekodi.kr/mcp',oauthProtectedResourceMetadata:'https://ekodi.kr/.well-known/oauth-protected-resource',documentation:'https://ekodi.kr/ai',recognitionIsAuthorization:false,orchestratorIsExecutionAuthority:true});
  if(name==='discover_public_services')return textResult('EKODI 공개 진입점은 인증 없이 발견할 수 있으며 개인·테넌트 데이터는 OAuth 이후에만 제공됩니다.',{canonicalOrigin:'https://ekodi.kr',public:[{id:'ai',url:'https://ekodi.kr/ai'},{id:'bible',url:'https://ekodi.kr/bible'},{id:'books',url:'https://ekodi.kr/books'},{id:'community',url:'https://ekodi.kr/community'},{id:'education',url:'https://ekodi.kr/education'},{id:'experience',url:'https://ekodi.kr/experience'}],privateCapabilitiesRequireOAuth:true});
  return null;
}

export async function callAuthorizedEkodiMcpExtensionTool(name,args,identity,env){
  if(name==='account_status')return textResult('EKODI OAuth 계정이 정식 EKODI 신원에 연결되어 있습니다.',{authenticated:true,canonical:true,connected:true,ekodiId:identity?.ekodiId||null,providerIndependent:true});
  if(name==='submit_task'){
    try{const task=await submitOrchestratorTask(env,identity,args);return textResult('EKODI Orchestrator가 작업을 접수했습니다.',{accepted:true,...task,authority:'ekodi-orchestrator'});}catch(error){return textResult('EKODI Orchestrator 작업 접수에 실패했습니다.',{accepted:false,error:String(error?.message||error).slice(0,240)});}
  }
  if(name==='get_task_status'){
    try{const task=await getOrchestratorTaskStatus(env,identity,args?.taskId);return task?textResult('EKODI Orchestrator의 권위 있는 작업 상태입니다.',{found:true,...task,authority:'ekodi-orchestrator'}):textResult('현재 EKODI 신원에 속한 작업을 찾을 수 없습니다.',{found:false,taskId:String(args?.taskId||'').slice(0,160)});}catch(error){return textResult('EKODI Orchestrator 작업 상태를 읽지 못했습니다.',{found:false,error:String(error?.message||error).slice(0,240)});}
  }
  if(name==='cancel_task'){
    try{const task=await cancelOrchestratorTask(env,identity,args?.taskId);return task?textResult(task.cancelled?'대기 중인 EKODI Orchestrator 작업을 취소했습니다.':'현재 상태에서는 작업을 취소하지 않았습니다.',{found:true,...task,authority:'ekodi-orchestrator'}):textResult('현재 EKODI 신원에 속한 작업을 찾을 수 없습니다.',{found:false,taskId:String(args?.taskId||'').slice(0,160)});}catch(error){return textResult('EKODI Orchestrator 작업 취소를 처리하지 못했습니다.',{cancelled:false,error:String(error?.message||error).slice(0,240)});}
  }
  return null;
}
