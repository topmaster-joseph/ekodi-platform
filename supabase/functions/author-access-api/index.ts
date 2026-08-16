import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const AUTHOR_ORIGIN="https://author.ekodi.kr";
const AUTH_ORIGIN="https://auth.ekodi.kr";

function cors(req:Request){
  const origin=req.headers.get("Origin")||"";
  const allowed=origin===AUTHOR_ORIGIN||origin===AUTH_ORIGIN?origin:AUTH_ORIGIN;
  return {"Access-Control-Allow-Origin":allowed,"Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
async function authenticated(req:Request){
  const authorization=req.headers.get("Authorization");
  if(!authorization)return null;
  const db=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await db.auth.getUser();
  return error||!data.user?null:{db,user:data.user};
}
async function personKey(userId:string){
  const {data}=await admin.from("login_identities").select("person_id").eq("auth_user_id",userId).eq("status","active").maybeSingle();
  return `personal:${data?.person_id||userId}`;
}
function validReturn(raw:unknown){try{const target=new URL(String(raw||AUTHOR_ORIGIN+"/"));return target.protocol==="https:"&&target.origin===AUTHOR_ORIGIN?target.href:null}catch{return null}}

Deno.serve(async(req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(req)});
  const auth=await authenticated(req);
  if(!auth)return json(req,{error:"unauthorized"},401);
  const requestUrl=new URL(req.url);
  const path=requestUrl.pathname.replace(/^\/author-access-api/,"")||"/";
  try{
    if(req.method==="GET"&&path==="/workspace"){
      const key=await personKey(auth.user.id);
      return json(req,{workspace:{workspace_key:key,workspace_kind:"personal",workspace_name:"내 저자 스튜디오",site:"author",role:"member",status:"active",plan:"free",requires_handoff:true,source:"synthetic"},user:{id:auth.user.id,email:auth.user.email??null}});
    }
    if(req.method==="POST"&&path==="/handoff"){
      const body=await req.json().catch(()=>({}));
      const returnTo=validReturn(body?.return_to);
      if(!returnTo)return json(req,{error:"invalid_handoff_target"},400);
      const email=String(auth.user.email||"").trim().toLowerCase();
      if(!email)return json(req,{error:"email_required"},400);
      const expectedKey=await personKey(auth.user.id);
      if(body?.workspace_key&&String(body.workspace_key)!==expectedKey)return json(req,{error:"workspace_mismatch"},403);
      const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email});
      const tokenHash=data?.properties?.hashed_token;
      if(error||!tokenHash){console.error("author handoff",error?.message||"missing_hashed_token");return json(req,{error:"handoff_token_issue_failed"},503)}
      return json(req,{ok:true,tokenHash,type:"email",returnTo,expiresFor:"single_use",plan:"free",workspace:{workspace_key:expectedKey,workspace_kind:"personal",workspace_name:"내 저자 스튜디오",site:"author",status:"active",requires_handoff:true}});
    }
    return json(req,{error:"not_found"},404);
  }catch(error){console.error("author-access-api",error);return json(req,{error:"author_access_failed"},500)}
}));
