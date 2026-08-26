import { injectEkodiShell } from './ekodi-shell-injector.js';
import { buildCoreAiGateway } from './core-ai-gateway.js';

const MAX_MESSAGE=4000;
const MAX_HISTORY=8;
const TOPICS={
  '관계':['골로새서 3:12-14','지금 그 관계에서 가장 지키고 싶은 것은 무엇인가요?'],
  '가족':['에베소서 4:1-3','가족에게 지금 가장 먼저 건넬 수 있는 작은 평화의 행동은 무엇인가요?'],
  '돈':['마태복음 6:25-34','돈에 대한 염려 가운데 오늘 내가 통제할 수 있는 한 가지는 무엇인가요?'],
  '일':['골로새서 3:23-24','오늘의 일을 사람의 평가보다 더 큰 의미와 연결한다면 무엇이 달라질까요?'],
  '진로':['잠언 3:5-6','앞길 전체가 아니라 지금 분명히 걸을 수 있는 한 걸음은 무엇인가요?'],
  '외로움':['시편 139:1-12','외로움 속에서 누군가에게 먼저 연결을 요청할 수 있다면 누구인가요?'],
  '실패':['고린도후서 4:7-9','이번 실패가 끝이라고 말하지 않는다면 무엇을 다시 시작할 수 있을까요?'],
  '분노':['야고보서 1:19-20','분노 아래에 숨은 상처나 두려움은 무엇인가요?'],
  '감사':['데살로니가전서 5:16-18','오늘 받은 것 가운데 다른 사람에게 흘려보낼 수 있는 감사는 무엇인가요?'],
  '믿음':['마가복음 9:24','믿음과 의심이 함께 있다면 지금 하나님께 가장 정직하게 말하고 싶은 것은 무엇인가요?']
};
const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&!!env.SUPABASE_URL&&!!env.SUPABASE_PUBLISHABLE_KEY;return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=bible',tenantSlug:env.TENANT_SLUG||'ekodi-church'}}
function clean(value,max=MAX_MESSAGE){return String(value??'').replace(/[<>]/g,'').trim().slice(0,max)}
function topicGuide(topic){return TOPICS[topic]||['요한복음 1:14','지금 삶에서 말씀과 함께 천천히 바라보고 싶은 것은 무엇인가요?']}
function fallbackReply(topic,message){const [scriptureRef,question]=topicGuide(topic);const lead=message?`“${clean(message,180)}”라고 말씀하셨군요. 그 말을 서둘러 해석하지 않고 먼저 곁에 두겠습니다.`:'정답부터 말하기보다 지금의 이야기를 먼저 듣겠습니다.';return{reply:`${lead}\n\n${scriptureRef}을 함께 펼쳐볼 수 있습니다. ${question}`,scriptureRef}}
async function verifyUser(request,env){const auth=request.headers.get('authorization')||'';if(!auth.startsWith('Bearer ')||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;try{const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{authorization:auth,apikey:env.SUPABASE_PUBLISHABLE_KEY}});if(!r.ok)return null;const user=await r.json();return user?.id?user:null}catch{return null}}
function createBibleProvider(env){const apiKey=String(env.OPENAI_API_KEY||'').trim();const model=String(env.BIBLE_AI_MODEL||env.OPENAI_MODEL||'gpt-5.6-terra').trim();return{id:'openai',available:Boolean(apiKey),async invoke({context}){if(!apiKey)throw new Error('AI_NOT_CONFIGURED');const history=(Array.isArray(context.history)?context.history:[]).slice(-MAX_HISTORY).map(x=>`${x.role==='assistant'?'도우미':'사용자'}: ${clean(x.content||x.text,1800)}`).join('\n');const instructions=[
'당신은 EKODI 말씀대화의 성경 묵상 대화 도우미입니다. 목회자나 교회를 대체하지 않습니다.',
'한국어로 따뜻하고 간결하게 답하며, 한 번에 설교하지 말고 가능하면 질문 하나를 중심으로 대화를 이어갑니다.',
'사용자의 말을 먼저 이해한 뒤 성경 본문을 연결합니다. 성경 본문 자체와 당신의 해석을 분명히 구분합니다.',
'하나님이 사용자에게 직접 특정 내용을 말씀하셨다고 선언하거나 예언하지 않습니다.',
'신학적 논쟁은 단정하지 말고 본문과 주요 기독교 전통의 범위에서 겸손하게 다룹니다.',
'개인정보 공유를 권하지 않으며, 타인에게 공유하기 전에 명시적 동의를 강조합니다.',
'자해, 타해, 학대, 폭력, 즉각적 위험의 신호가 있으면 영적 조언만 하지 말고 즉시 지역 응급지원과 신뢰할 수 있는 사람, 전문기관의 도움을 요청하도록 안내합니다.',
'답변은 대체로 3~7문장으로 하고 마지막에는 사용자가 답할 수 있는 질문 하나를 둡니다.'
].join('\n');const input=`주제: ${clean(context.topic,60)}\n연결 본문: ${clean(context.scriptureRef,120)}\n최근 대화:\n${history||'(없음)'}\n\n사용자: ${clean(context.message)}`;const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,store:false,instructions,input,max_output_tokens:700,metadata:{ekodi_surface:'bible-conversation',ekodi_task:'scripture-dialogue'}})});let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(`AI_HTTP_${r.status}`);let text=String(data?.output_text||'').trim();if(!text){for(const item of data?.output||[])for(const part of item?.content||[])if(part?.text)text+=`${part.text}\n`}if(!text.trim())throw new Error('AI_EMPTY');return{text:text.trim(),model:String(data?.model||model),responseId:String(data?.id||'')}}}}}
async function handleAssist(request,env){let body=null;try{body=await request.json()}catch{return json({error:'INVALID_JSON'},400)}const message=clean(body?.message);const topic=clean(body?.topic,60)||'믿음';if(!message)return json({error:'MESSAGE_REQUIRED'},400);const user=await verifyUser(request,env);const [scriptureRef]=topicGuide(topic);const fallback=()=>fallbackReply(topic,message);if(!user){const value=fallback();return json({ok:true,mode:'free_assist',degraded:true,authenticated:false,...value,notice:'로그인하면 개인 Journey 저장과 AI 대화를 사용할 수 있습니다.'})}const provider=createBibleProvider(env);const gateway=buildCoreAiGateway(env,[provider]);const result=await gateway.run({taskName:'bible-conversation',timeoutMs:15000,context:{message,topic,scriptureRef,history:Array.isArray(body?.history)?body.history:[]},fallback});const value=result.value&&typeof result.value==='object'?result.value:{reply:String(result.value||'')};return json({ok:result.ok,mode:result.mode,degraded:Boolean(result.degraded),authenticated:true,reply:value.text||value.reply||fallback().reply,scriptureRef,provider:result.provider||null,notice:result.notice||''},result.ok?200:503)}
function withHeaders(response){const headers=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))headers.set(k,v);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function assetFor(request,env,path){const url=new URL(request.url);url.pathname=path;return env.ASSETS.fetch(new Request(url,request))}
export default{async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/health')return json({ok:true,service:'ekodi-bible-conversation',surface:'scripture-conversation',areas:['today','conversation','journey','together'],privacyDefault:'private',explicitSharing:true,providerIndependent:true,dataMode:runtimeConfig(env).dataMode,ekodiShell:true});if(url.pathname==='/config.js')return new Response(`window.EKODI_BIBLE_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});if(url.pathname==='/api/assist'&&request.method==='POST')return handleAssist(request,env);if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/#ai-services',307);let response;if(['/today','/conversation','/journey','/together'].includes(url.pathname.replace(/\/$/,'')))response=await assetFor(request,env,'/');else response=await env.ASSETS.fetch(request);return injectEkodiShell(withHeaders(response),'bible')}};