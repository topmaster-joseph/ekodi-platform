import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { reconcileAuthorBilling } from "../_shared/author-billing.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const OPENAI_MODEL=Deno.env.get("OPENAI_MODEL")||"gpt-5-mini";
const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ALLOWED_ORIGINS=new Set(["https://author.ekodi.kr","https://auth.ekodi.kr"]);
const OPERATIONS:Record<string,{units:number,label:string,maxOutput:number}>={draft:{units:1,label:"Creator AI 초안",maxOutput:4200},rewrite:{units:1,label:"Creator AI 재작성",maxOutput:4200},edit:{units:1,label:"Editor AI 편집",maxOutput:3200},research:{units:2,label:"Research AI 검토",maxOutput:3200},chief:{units:1,label:"Chief AI 품질검토",maxOutput:2400}};
const MODE_LABELS:Record<string,string>={writer:"글·책",video:"영상·쇼츠",podcast:"오디오·팟캐스트",lecture:"강의·교육",research:"연구·전문지식",visual:"비주얼·디자인",mission:"설교·선교·공동체",ai:"AI 협업형 창작"};

function cors(req:Request){const origin=req.headers.get("Origin")||"";const allowed=ALLOWED_ORIGINS.has(origin)?origin:"https://author.ekodi.kr";return {"Access-Control-Allow-Origin":allowed,"Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
async function authenticated(req:Request){const authorization=req.headers.get("Authorization");if(!authorization)return null;const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data,error}=await client.auth.getUser();return error?null:data.user;}
function compact(value:unknown,max=12000){return String(value??"").replace(/\u0000/g,"").slice(0,max)}
function outputText(payload:any){if(typeof payload?.output_text==="string"&&payload.output_text.trim())return payload.output_text.trim();const parts:string[]=[];for(const item of payload?.output||[]){for(const content of item?.content||[]){if(typeof content?.text==="string")parts.push(content.text)}}return parts.join("\n").trim()}
function normalizeMode(value:unknown){const mode=compact(value,30).trim().toLowerCase();return MODE_LABELS[mode]?mode:"writer"}
function systemInstruction(operation:string,creatorMode:string){
  const modeLabel=MODE_LABELS[creatorMode]||MODE_LABELS.writer;
  const shared=["당신은 EKODI Creator AI의 전문 창작팀입니다.",`현재 창작 모드는 ${modeLabel}입니다.`,"사람의 경험, 관점, 자료와 소명을 우선하고 AI가 창작자의 주도권을 빼앗지 마세요.","사실을 지어내지 말고 확인되지 않은 사실·통계·직접인용은 '확인 필요'로 표시하세요.","텍스트 생성만 가능한 상황에서 실제 영상 렌더링, 녹음, 이미지 생성, 외부 검색 또는 출판을 완료했다고 주장하지 마세요.","사람의 최종 승인 없이 공개·출판·배포 완료를 주장하지 마세요.","한국어 문장은 자연스럽고 반복을 줄이며 요청된 톤과 대상 수준을 지키세요."].join(" ");
  const role:Record<string,string>={draft:"Creator AI 역할입니다. 제공된 구성 목적과 Creator Memory를 따라 바로 활용 가능한 초안을 작성하세요. 영상이면 스크립트와 장면 지시, 팟캐스트면 진행 대본, 강의면 강의안, 비주얼이면 카피와 디자인 브리프처럼 현재 모드에 맞게 출력하세요.",rewrite:"Creator AI 역할입니다. 기존 작업의 핵심 의미는 보존하면서 현재 창작 모드와 사용자 요청에 맞게 재작성하세요.",edit:"Editor AI 역할입니다. 논리, 흐름, 중복, 표현, 가독성과 매체 적합성을 개선한 편집본을 제시하세요.",research:"Research AI 역할입니다. 검증이 필요한 주장, 근거 부족, 확인할 자료와 안전하게 유지 가능한 내용을 구분해 제시하세요. 외부 검색을 했다고 주장하지 마세요.",chief:"Chief AI 역할입니다. 프로젝트 전체 목적과 현재 구성의 역할을 비교해 품질, 누락, 중복, 사람의 주도권, 다음 작업을 간결하게 제시하세요."};
  return `${shared}\n${role[operation]||role.draft}`;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  const user=await authenticated(req);if(!user)return json(req,{error:"unauthorized"},401);
  const body=await req.json().catch(()=>({}));
  const projectId=compact(body?.project_id,80).trim();const chapterId=compact(body?.chapter_id,80).trim();const operation=compact(body?.operation,30).trim().toLowerCase();const userInstruction=compact(body?.instruction,4000).trim();const op=OPERATIONS[operation];
  if(!projectId||!op)return json(req,{error:"invalid_request"},400);

  let billingVerification:any;
  try{
    billingVerification=await reconcileAuthorBilling(req,admin,user.id);
  }catch(error){
    console.error("author-ai-api billing verification",error instanceof Error?error.message:"unknown");
    return json(req,{error:"billing_verification_unavailable",message:"결제상태를 안전하게 확인할 수 없어 AI 호출을 시작하지 않았습니다."},503);
  }
  if(!billingVerification?.paid_ai_active){
    return json(req,{error:"paid_membership_required",message:"결제가 확인된 CREATOR 또는 PRO 회원만 유료 AI를 사용할 수 있습니다.",billing:billingVerification},402);
  }

  let reserved=false;let providerStarted=false;
  try{
    const {data:project,error:projectError}=await admin.from("author_projects").select("id,owner_user_id,title,working_title,interest,field,audience,book_format,tone,narrative_mode,target_words,status,book_memory,creator_mode").eq("id",projectId).eq("owner_user_id",user.id).maybeSingle();
    if(projectError)throw projectError;if(!project)return json(req,{error:"project_not_found"},404);
    const creatorMode=normalizeMode(project.creator_mode||project.book_memory?.creator_mode||body?.creator_mode);const modeLabel=MODE_LABELS[creatorMode];
    let chapter:any=null;
    if(chapterId){const {data,error}=await admin.from("author_chapters").select("id,project_id,owner_user_id,chapter_order,title,purpose,draft_text,status,version").eq("id",chapterId).eq("project_id",projectId).eq("owner_user_id",user.id).maybeSingle();if(error)throw error;if(!data)return json(req,{error:"chapter_not_found"},404);chapter=data;}
    const {data:gate,error:gateError}=await admin.rpc("author_reserve_ai_units",{p_user_id:user.id,p_operation:operation,p_units:op.units});if(gateError)throw gateError;
    if(!gate?.allowed){const status=gate?.reason==="monthly_ai_quota_exceeded"?429:402;return json(req,{error:gate?.reason||"paid_membership_required",entitlement:gate,billing:billingVerification},status)}reserved=true;
    if(!OPENAI_API_KEY){await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units});reserved=false;return json(req,{error:"ai_provider_not_configured",message:"전용 AI 비밀키 연결이 완료되면 결제가 확인된 유료회원에게만 Creator AI가 활성화됩니다."},503)}
    const {data:unitList}=await admin.from("author_chapters").select("chapter_order,title,purpose,status").eq("project_id",projectId).eq("owner_user_id",user.id).order("chapter_order");
    const input=[`창작 모드: ${modeLabel}`,`프로젝트 제목: ${compact(project.working_title||project.title,300)}`,`관심/핵심 문제의식: ${compact(project.interest,1600)}`,`분야: ${compact(project.field,120)}`,`대상: ${compact(project.audience,300)}`,`톤: ${compact(project.tone,120)}`,`전개 방식: ${compact(project.narrative_mode,120)}`,`형식: ${compact(project.book_format,160)}`,`Creator Memory: ${compact(JSON.stringify(project.book_memory||{}),5000)}`,`전체 구성: ${compact((unitList||[]).map((c:any)=>`${c.chapter_order}. ${c.title} | ${c.purpose}`).join("\n"),5000)}`,chapter?`현재 구성: ${chapter.chapter_order}. ${compact(chapter.title,300)}\n구성 목적: ${compact(chapter.purpose,1200)}\n현재 작업:\n${compact(chapter.draft_text,30000)}`:"현재 구성이 지정되지 않았습니다.",userInstruction?`창작자 요청: ${userInstruction}`:"창작자 추가 요청 없음",operation==="research"?"출력 형식: 1) 검증 필요 주장 2) 근거 보강 포인트 3) 창작자에게 확인할 질문 4) 안전하게 유지 가능한 내용":"출력은 현재 창작 모드에서 바로 편집 가능한 산출물 중심으로 작성하세요. 불필요한 서문이나 자기소개는 생략하세요."].join("\n\n");
    providerStarted=true;
    const provider=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:OPENAI_MODEL,store:false,instructions:systemInstruction(operation,creatorMode),input,max_output_tokens:op.maxOutput}),signal:AbortSignal.timeout(90000)});
    const payload=await provider.json().catch(()=>({}));
    if(!provider.ok){await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units});reserved=false;providerStarted=false;console.error("author-ai-api provider",provider.status,payload?.error?.type||"unknown");await admin.from("author_ai_usage").insert({user_id:user.id,project_id:projectId,chapter_id:chapter?.id||null,operation,provider:"openai",model:OPENAI_MODEL,ai_units:0,status:"failed"});return json(req,{error:"ai_provider_failed"},502)}
    reserved=false;const usage=payload?.usage||{};const text=outputText(payload);
    if(!text){await admin.from("author_ai_usage").insert({user_id:user.id,project_id:projectId,chapter_id:chapter?.id||null,operation,provider:"openai",model:String(payload?.model||OPENAI_MODEL),ai_units:op.units,input_tokens:Number(usage.input_tokens||0),output_tokens:Number(usage.output_tokens||0),status:"failed",provider_request_id:String(payload?.id||"")||null});return json(req,{error:"empty_ai_response"},502)}
    await admin.from("author_ai_usage").insert({user_id:user.id,project_id:projectId,chapter_id:chapter?.id||null,operation,provider:"openai",model:String(payload?.model||OPENAI_MODEL),ai_units:op.units,input_tokens:Number(usage.input_tokens||0),output_tokens:Number(usage.output_tokens||0),status:"completed",provider_request_id:String(payload?.id||"")||null});
    await admin.from("author_events").insert({project_id:projectId,owner_user_id:user.id,actor:operation==="edit"?"editor-ai":operation==="research"?"research-ai":operation==="chief"?"chief-ai":"author-ai",event_type:`ai.${operation}.completed`,payload:{chapter_id:chapter?.id||null,ai_units:op.units,model:String(payload?.model||OPENAI_MODEL),creator_mode:creatorMode}});
    return json(req,{ok:true,operation,label:op.label,creator_mode:creatorMode,text,usage:{ai_units:op.units,input_tokens:Number(usage.input_tokens||0),output_tokens:Number(usage.output_tokens||0)},entitlement:gate,billing:billingVerification});
  }catch(error){
    if(reserved&&!providerStarted){try{await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units})}catch{}}
    if(reserved&&providerStarted){try{await admin.from("author_ai_usage").insert({user_id:user.id,project_id:projectId,chapter_id:chapterId||null,operation,provider:"openai",model:OPENAI_MODEL,ai_units:op.units,status:"failed"})}catch{}}
    console.error("author-ai-api",error);return json(req,{error:"author_ai_failed"},500)
  }
});
