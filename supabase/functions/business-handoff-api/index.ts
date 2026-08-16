import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const RETURN_TO="https://business.ekodi.kr/";

const cors=(req:Request)=>{
  const origin=req.headers.get("Origin")||"https://auth.ekodi.kr";
  const allowed=origin==="https://auth.ekodi.kr"||origin==="https://business.ekodi.kr";
  return{
    "Access-Control-Allow-Origin":allowed?origin:"https://auth.ekodi.kr",
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  const authorization=req.headers.get("Authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json(req,{error:"unauthorized"},401);

  const db=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await db.auth.getUser();
  const user=userData.user;
  if(userError||!user?.id||!user.email)return json(req,{error:"unauthorized"},401);

  let allowedWorkspace:string|null=null;
  for(const workspace of ["ekodibiz","jadam"]){
    const {error}=await db.rpc("business_os_snapshot",{p_workspace_key:workspace});
    if(!error){allowedWorkspace=workspace;break;}
  }
  if(!allowedWorkspace)return json(req,{error:"business_workspace_access_required"},403);

  const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email:user.email});
  const tokenHash=data?.properties?.hashed_token;
  if(error||!tokenHash){
    console.error("business handoff generateLink",error?.message||"missing_hashed_token");
    return json(req,{error:"handoff_token_issue_failed"},503);
  }

  return json(req,{ok:true,tokenHash,type:"email",returnTo:RETURN_TO,workspace:allowedWorkspace,expiresFor:"single_use"});
});