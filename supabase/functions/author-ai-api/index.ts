import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const OPENAI_MODEL=Deno.env.get("OPENAI_MODEL")||"gpt-5-mini";
const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ALLOWED_ORIGINS=new Set(["https://author.ekodi.kr","https://auth.ekodi.kr"]);
const OPERATIONS:Record<string,{units:number,label:string,maxOutput:number}>={
  draft:{units:1,label:"Author AI 초고",maxOutput:4200},
  rewrite:{units:1,label:"Author AI 재작성",maxOutput:4200},
  edit:{units:1,label:"Editor AI 편집",maxOutput:3200},
  research:{units:2,label:"Research AI 검토",maxOutput:3200},
  chief:{units:1,label:"Chief AI 품질검토",maxOutput:2400},
};

function cors(req:Request){
  const origin=req.headers.get("Origin")||"";
  const allowed=ALLOWED_ORIGINS.has(origin)?origin:"https://author.ekodi.kr";
  return {"Access-Control-Allow-Origin":allowed,"Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
async function authenticated(req:Request){
  const authorization=req.headers.get("Authorization");
  if(!authorization)return null;
  const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await client.auth.getUser();
  return error?null:data.user;
}
function compact(value:unknown,max=12000){return String(value??"").replace(/\u0000/g,"").slice(0,max)}
function outputText(payload:any){
  if(typeof payload?.output_text==="string"&&payload.output_text.trim())return payload.output_text.trim();
  const parts:string[]=[];
  for(const item of payload?.output||[]){
    for(const content of item?.content||[]){
      if(typeof content?.text==="string")parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
function systemInstruction(operation:string){
  const shared="당신은 EKODI Author AI의 집필팀입니다. 저자의 관점과 자료를 우선하고, 사실을 지어내지 마세요. 확인되지 않은 사실·통계·직접인용은 확인 필요라고 표시하세요. 저자의 최종 승인 없이 출판 완료를 주장하지 마세요. 한국어 문장은 자연스럽고 반복을 줄이며, 요청된 문체와 독자 수준을 지키세요.";
  const role:Record<string,string>={
    draft:"Author AI 역할입니다. 제공된 장 목적과 Book Memory를 따라 초고를 작성하세요.",
    rewrite:"Author AI 역할입니다. 기존 원고의 핵심 의미는 보존하면서 요청에 맞게 재작성하세요.",
    edit:"Editor AI 역할입니다. 논리, 흐름, 중복, 문체, 가독성을 개선한 편집본을 제시하세요.",
    research:"Research AI 역할입니다. 원고의 검증이 필요한 주장, 근거 부족, 확인할 자료를 구분해 제시하세요. 외부 검색을 했다고 주장하지 마세요.",
    chief:"Chief AI 역할입니다. 책 전체 목적과 현재 장의 역할을 비교해 품질, 누락, 중복, 다음 작업을 간결하게 제시하세요.",
  };
  return `${shared}\n${role[operation]||role.draft}`;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  const user=await authenticated(req);
  if(!user)return json(req,{error:"unauthorized"},401);
  const body=await req.json().catch(()=>({}));
  const projectId=compact(body?.project_id,80).trim();
  const chapterId=compact(body?.chapter_id,80).trim();
  const operation=compact(body?.operation,30).trim().toLowerCase();
  const userInstruction=compact(body?.instruction,4000).trim();
  const op=OPERATIONS[operation];
  if(!projectId||!op)return json(req,{error:"invalid_request"},400);

  let reserved=false;
  try{
    const {data:project,error:projectError}=await admin.from("author_projects")
      .select("id,owner_user_id,title,working_title,interest,field,audience,book_format,tone,narrative_mode,target_words,status,book_memory")
      .eq("id",projectId).eq("owner_user_id",user.id).maybeSingle();
    if(projectError)throw projectError;
    if(!project)return json(req,{error:"project_not_found"},404);

    let chapter:any=null;
    if(chapterId){
      const {data,error}=await admin.from("author_chapters")
        .select("id,project_id,owner_user_id,chapter_order,title,purpose,draft_text,status,version")
        .eq("id",chapterId).eq("project_id",projectId).eq("owner_user_id",user.id).maybeSingle();
      if(error)throw error;
      if(!data)return json(req,{error:"chapter_not_found"},404);
      chapter=data;
    }

    // This RPC is the financial firewall. It returns allowed=false for every free,
    // expired, cancelled or non-payment-backed membership before any OpenAI request.
    const {data:gate,error:gateError}=await admin.rpc("author_reserve_ai_units",{p_user_id:user.id,p_operation:operation,p_units:op.units});
    if(gateError)throw gateError;
    if(!gate?.allowed){
      const status=gate?.reason==="monthly_ai_quota_exceeded"?429:402;
      return json(req,{error:gate?.reason||"paid_membership_required",entitlement:gate},status);
    }
    reserved=true;

    if(!OPENAI_API_KEY){
      await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units});
      reserved=false;
      return json(req,{error:"ai_provider_not_configured",message:"전용 AI 비밀키 연결이 완료되면 유료회원에게만 AI 집필이 활성화됩니다."},503);
    }

    const {data:chapterList}=await admin.from("author_chapters").select("chapter_order,title,purpose,status").eq("project_id",projectId).eq("owner_user_id",user.id).order("chapter_order");
    const input=[
      `책 제목: ${compact(project.working_title||project.title,300)}`,
      `관심/핵심 문제의식: ${compact(project.interest,1600)}`,
      `분야: ${compact(project.field,120)}`,
      `독자: ${compact(project.audience,300)}`,
      `문체: ${compact(project.tone,120)}`,
      `서술 방식: ${compact(project.narrative_mode,120)}`,
      `Book Memory: ${compact(JSON.stringify(project.book_memory||{}),5000)}`,
      `전체 목차: ${compact((chapterList||[]).map((c:any)=>`${c.chapter_order}. ${c.title} | ${c.purpose}`).join("\n"),5000)}`,
      chapter?`현재 장: ${chapter.chapter_order}. ${compact(chapter.title,300)}\n장 목적: ${compact(chapter.purpose,1200)}\n현재 원고:\n${compact(chapter.draft_text,30000)}`:"현재 장이 지정되지 않았습니다.",
      userInstruction?`저자 요청: ${userInstruction}`:"저자 추가 요청 없음",
      operation==="research"?"출력 형식: 1) 검증 필요 주장 2) 근거 보강 포인트 3) 저자에게 확인할 질문 4) 안전하게 유지 가능한 문장":"출력은 바로 편집 가능한 본문 중심으로 작성하세요. 불필요한 서문이나 자기소개는 생략하세요."
    ].join("\n\n");

    const provider=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:OPENAI_MODEL,store:false,instructions:systemInstruction(operation),input,max_output_tokens:op.maxOutput}),
      signal:AbortSignal.timeout(90000),
    });
    const payload=await provider.json().catch(()=>({}));
    if(!provider.ok){
      await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units});
      reserved=false;
      console.error("author-ai-api provider",provider.status,payload?.error?.type||"unknown");
      await admin.from("author_ai_usage").insert({user_id:user.id,project_id:projectId,chapter_id:chapter?.id||null,operation,provider:"openai",model:OPENAI_MODEL,ai_units:0,status:"failed"});
      return json(req,{error:"ai_provider_failed"},502);
    }

    const text=outputText(payload);
    if(!text){
      await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units});
      reserved=false;
      return json(req,{error:"empty_ai_response"},502);
    }
    const usage=payload?.usage||{};
    await admin.from("author_ai_usage").insert({
      user_id:user.id,project_id:projectId,chapter_id:chapter?.id||null,operation,provider:"openai",model:String(payload?.model||OPENAI_MODEL),ai_units:op.units,
      input_tokens:Number(usage.input_tokens||0),output_tokens:Number(usage.output_tokens||0),status:"completed",provider_request_id:String(payload?.id||"")||null
    });
    await admin.from("author_events").insert({project_id:projectId,owner_user_id:user.id,actor:operation==="edit"?"editor-ai":operation==="research"?"research-ai":operation==="chief"?"chief-ai":"author-ai",event_type:`ai.${operation}.completed`,payload:{chapter_id:chapter?.id||null,ai_units:op.units,model:String(payload?.model||OPENAI_MODEL)}});

    return json(req,{ok:true,operation,label:op.label,text,usage:{ai_units:op.units,input_tokens:Number(usage.input_tokens||0),output_tokens:Number(usage.output_tokens||0)},entitlement:gate});
  }catch(error){
    if(reserved){try{await admin.rpc("author_release_ai_units",{p_user_id:user.id,p_units:op.units})}catch{}}
    console.error("author-ai-api",error);
    return json(req,{error:"author_ai_failed"},500);
  }
});
