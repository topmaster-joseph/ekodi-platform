import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
  }
});

function publishableKeys(){
  try{
    const raw=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}";
    const parsed=JSON.parse(raw);
    return new Set(Object.values(parsed).map(String).filter(Boolean));
  }catch{
    return new Set<string>();
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET"&&req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const supplied=(req.headers.get("apikey")||"").trim();
  if(!supplied||!publishableKeys().has(supplied))return json({ok:false,error:"unauthorized"},401);

  const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/+$/,"");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({ok:false,error:"telemetry_backend_unavailable"},503);

  const response=await fetch(`${url}/rest/v1/rpc/ekodi_resource_telemetry`,{
    method:"POST",
    headers:{
      "apikey":service,
      "authorization":`Bearer ${service}`,
      "content-type":"application/json",
      "accept":"application/json",
    },
    body:"{}",
  });
  if(!response.ok)return json({ok:false,error:"telemetry_query_failed",status:response.status},502);
  const rows=await response.json().catch(()=>[]);
  const row=Array.isArray(rows)?rows[0]||{}:rows||{};
  const databaseBytes=Number(row.database_bytes);
  const storageBytes=Number(row.storage_object_bytes);
  return json({
    ok:true,
    database_bytes:Number.isFinite(databaseBytes)?databaseBytes:null,
    storage_object_bytes:Number.isFinite(storageBytes)?storageBytes:null,
    measured_at:new Date().toISOString(),
  });
});
