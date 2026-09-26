import {getTechnologyScoutOverview,decideTechnologyScoutCandidate,runEkodiDailyTechnologyScout} from './ekodi-technology-scout.js';
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function handleTechnologyScoutControl(request,env,identity={}){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/control/technology-scout'))return null;
 if(request.method==='GET')return json(await getTechnologyScoutOverview(env));
 if(request.method==='POST'&&url.pathname.endsWith('/run'))return json(await runEkodiDailyTechnologyScout(env,{trigger:'admin-manual'}));
 if(request.method==='POST'&&url.pathname.endsWith('/decision')){const body=await request.json().catch(()=>({}));return json(await decideTechnologyScoutCandidate(env,{candidateId:body.candidateId,decision:body.decision,actor:identity?.email||identity?.personId||'ekodi-admin'}));}
 return json({error:'METHOD_NOT_ALLOWED'},405);
}
