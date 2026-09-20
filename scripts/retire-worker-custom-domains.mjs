import fs from "node:fs";

const args=process.argv.slice(2);
const arg=(name,fallback="")=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const configPath=arg("--config");
const dryRun=args.includes("--dry-run");
if(!configPath||!fs.existsSync(configPath))throw new Error("Use --config <file>");
const config=JSON.parse(fs.readFileSync(configPath,"utf8"));
const rootDomain=String(config.rootDomain||"").trim();
const targets=Array.isArray(config.targets)?config.targets:[];
if(rootDomain!=="ekodi.kr"||!targets.length)throw new Error("Invalid retirement config");
const rootHost=["ekodi","kr"].join(".");
const oldHost=t=>String(t.label)+"."+rootHost;
for(const t of targets){
  if(!/^[a-z0-9-]+$/.test(String(t.label||"")))throw new Error("Invalid target label");
  if(!String(t.service||"").startsWith("ekodi-"))throw new Error("Invalid target service");
  if(!String(t.apexHealth||"").startsWith("https://ekodi.kr/"))throw new Error("Apex health must use ekodi.kr path");
  if(!String(t.directHealth||"").endsWith(".workers.dev/health"))throw new Error("Direct health must use workers.dev");
}
if(dryRun){for(const t of targets)console.log("PLAN "+t.label+" -> "+t.service+" -> "+t.apexHealth);process.exit(0)}
const account=process.env.CLOUDFLARE_ACCOUNT_ID||"";
const token=process.env.CLOUDFLARE_API_TOKEN||"";
if(!account||!token)throw new Error("Missing Cloudflare production credentials");
const api="https://api.cloudflare.com/client/v4";
const auth={authorization:"Bearer "+token,"content-type":"application/json"};

async function cf(path,options={}){
  const response=await fetch(api+path,{...options,headers:{...auth,...(options.headers||{})},signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.success===false)throw new Error("Cloudflare API "+response.status+": "+JSON.stringify(data.errors||data));
  return data;
}
async function listDomains(){return (await cf("/accounts/"+account+"/workers/domains")).result||[]}
async function health(url,expect=[]){
  const response=await fetch(url,{redirect:"follow",headers:{"user-agent":"EKODI zero-subdomain verifier"},signal:AbortSignal.timeout(15000)});
  const body=await response.text();
  if(!response.ok)throw new Error("Health failed "+url+": HTTP "+response.status);
  for(const marker of expect||[])if(!body.includes(marker))throw new Error("Health marker missing "+url+": "+marker);
}
async function attach(domain){
  const body={hostname:domain.hostname,service:domain.service};
  if(domain.zone_id)body.zone_id=domain.zone_id;
  if(domain.zone_name)body.zone_name=domain.zone_name;
  await cf("/accounts/"+account+"/workers/domains",{method:"PUT",body:JSON.stringify(body)});
}
async function legacyGone(host){
  for(let attempt=1;attempt<=60;attempt++){
    try{const response=await fetch("https://"+host+"/",{redirect:"manual",signal:AbortSignal.timeout(10000)});if(response.status<200||response.status>=400)return true}catch{return true}
    await new Promise(r=>setTimeout(r,5000));
  }
  return false;
}

const detached=[];
let rollbackAllowed=true;
try{
  for(const t of targets){await health(t.apexHealth,t.apexExpect||t.expect);await health(t.directHealth,t.directExpect||t.expect)}
  const domains=await listDomains();
  for(const t of targets){
    const host=oldHost(t);
    const matches=domains.filter(d=>d.hostname===host);
    if(matches.length>1)throw new Error("Multiple Worker domains found for "+host);
    if(!matches.length){console.log("Already detached: "+host);continue}
    const domain=matches[0];
    if(domain.service!==t.service)throw new Error("Refusing detach: "+host+" belongs to "+domain.service+", expected "+t.service);
    await cf("/accounts/"+account+"/workers/domains/"+domain.id,{method:"DELETE"});
    detached.push(domain);
    console.log("Detached "+host+" from "+t.service);
  }
  for(const t of targets){
    const host=oldHost(t);
    let absent=false;
    for(let attempt=1;attempt<=18;attempt++){absent=!(await listDomains()).some(d=>d.hostname===host);if(absent)break;await new Promise(r=>setTimeout(r,2500))}
    if(!absent)throw new Error("Domain still attached: "+host);
    await health(t.apexHealth,t.apexExpect||t.expect);
    await health(t.directHealth,t.directExpect||t.expect);
  }
  rollbackAllowed=false;
  for(const t of targets){
    const host=oldHost(t);
    if(!(await legacyGone(host)))throw new Error("Legacy hostname propagation still active after detach: "+host);
    console.log("Verified retired: "+host+"; apex healthy: "+t.apexHealth);
  }
}catch(error){
  console.error("Retirement failed: "+(error&&error.message?error.message:error));
  if(rollbackAllowed){
    for(const domain of detached.reverse()){try{await attach(domain);console.error("Rollback reattached "+domain.hostname+" -> "+domain.service)}catch(e){console.error("Rollback failed for "+domain.hostname+": "+(e&&e.message?e.message:e))}}
  }else{
    console.error("Domains remain detached because Cloudflare source-of-truth removal and canonical health checks already succeeded; do not undo retirement for edge propagation lag.");
  }
  process.exit(1);
}
console.log("Wave custom-domain retirement verified.");
