import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const ALLOWED=new Set(["https://author.ekodi.kr","https://auth.ekodi.kr"]);
const cors=(req:Request)=>{const origin=req.headers.get("Origin")||"";return {"Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:"https://author.ekodi.kr","Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
async function user(req:Request){const authorization=req.headers.get("Authorization");if(!authorization)return null;const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data,error}=await client.auth.getUser();return error?null:data.user}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(req)});
  const current=await user(req);
  if(!current)return json(req,{error:"unauthorized"},401);
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  const body=await req.json().catch(()=>({}));
  const projectId=String(body?.project_id||"").trim();
  if(!projectId)return json(req,{error:"project_id_required"},400);
  try{
    const {data:project,error:projectError}=await admin.from("author_projects").select("id,owner_user_id,title,working_title,status,target_words,chief_share_level,created_at,updated_at").eq("id",projectId).eq("owner_user_id",current.id).maybeSingle();
    if(projectError)throw projectError;
    if(!project)return json(req,{error:"project_not_found"},404);
    const {data:chapters,error:chapterError}=await admin.from("author_chapters").select("id,chapter_order,title,status,draft_text,version").eq("project_id",projectId).eq("owner_user_id",current.id).order("chapter_order");
    if(chapterError)throw chapterError;
    const rows=chapters||[];
    const empty=rows.filter((item:any)=>!String(item.draft_text||"").trim());
    const reviewed=rows.filter((item:any)=>["reviewed","approved"].includes(String(item.status||"")));
    const totalChars=rows.reduce((sum:number,item:any)=>sum+String(item.draft_text||"").length,0);
    const estimatedWords=Math.max(0,Math.round(totalChars/2.3));
    const issues:string[]=[];
    if(rows.length<3)issues.push("목차가 너무 짧거나 아직 구성되지 않았습니다.");
    if(empty.length)issues.push(`${empty.length}개 장에 초고가 없습니다.`);
    if(reviewed.length<rows.length)issues.push(`${rows.length-reviewed.length}개 장이 검토 완료되지 않았습니다.`);
    if(project.status==="publish_ready"&&issues.length)issues.push("출판 인계 전 모든 장의 초고와 검토상태를 확인해야 합니다.");
    let readiness="writing";
    if(project.status==="review")readiness=issues.length?"revision_required":"ready_for_author_approval";
    else if(project.status==="author_approved")readiness=issues.length?"approved_with_gaps":"ready_for_publish_request";
    else if(project.status==="publish_ready")readiness=issues.length?"publish_blocked":"books_handoff_ready";
    const summary={project_id:projectId,status:project.status,readiness,chapter_count:rows.length,reviewed_chapters:reviewed.length,empty_chapters:empty.length,estimated_words:estimatedWords,target_words:Number(project.target_words||0),issues};
    await admin.from("author_events").insert({project_id:projectId,owner_user_id:current.id,actor:"chief-ai",event_type:"chief.milestone.reviewed",payload:summary});
    const jobStatus=issues.length?"review_required":"completed";
    await admin.from("author_agent_jobs").insert({project_id:projectId,owner_user_id:current.id,agent_role:"chief-ai",task_type:"milestone_review",instructions:"Validate author workflow readiness without copying manuscript body into the event log.",context_scope:"metadata",status:jobStatus,result_summary:issues.length?issues.join(" "):`${readiness}: ${rows.length} chapters, ${reviewed.length} reviewed.`});
    return json(req,{ok:true,review:summary});
  }catch(error){console.error("author-agent-api",error);return json(req,{error:"author_agent_failed"},500)}
});
