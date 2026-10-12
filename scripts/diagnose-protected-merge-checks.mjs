#!/usr/bin/env node
// EKODI read-only investigation of GitHub protected merge/check provenance.
// No mutations, workflow dispatch, branch ref updates, or protection changes.
import fs from 'node:fs';

const REPO='topmaster-joseph/ekodi-platform';
const REQUIRED=['test','EKODI AI Orchestration Gate'];
const SAFE_TARGETS=[4392,4346,4441,4456];

export function summarizeStatuses(body={}){
  return (Array.isArray(body.statuses)?body.statuses:[]).slice(0,100).map(x=>({
    context:String(x.context||'').slice(0,120),
    state:String(x.state||'').slice(0,35),
    creator:String(x.creator?.login||'').slice(0,80),
  }));
}
export function summarizeCheckRuns(body={}){
  return (Array.isArray(body.check_runs)?body.check_runs:[]).slice(0,100).map(x=>({
    name:String(x.name||'').slice(0,120),
    status:String(x.status||'').slice(0,35),
    conclusion:String(x.conclusion||'').slice(0,35),
    app:String(x.app?.slug||'').slice(0,80),
  }));
}
export function summarizeRequiredRules(payload){
  if(!Array.isArray(payload))return [];
  return payload.filter(x=>x?.type==='required_status_checks').map(x=>({
    enforcement:String(x.enforcement||'').slice(0,40),
    contexts:(Array.isArray(x.parameters?.required_status_checks)?
      x.parameters.required_status_checks:[]).map(z=>({
      context:String(z.context||'').slice(0,120),
      integrationId:Number(z.integration_id)||null,
    })),
  })).slice(0,15);
}
export function compareRequired(statuses,checkRuns,required=REQUIRED){
  return required.map(name=>{
    const status=statuses.find(x=>x.context===name);
    const checks=checkRuns.filter(x=>x.name===name);
    return {
      context:name,
      commitStatus:status?.state||'missing',
      commitStatusCreator:status?.creator||null,
      checkRuns:checks.map(x=>({status:x.status,conclusion:x.conclusion,app:x.app})),
      checkRunPresent:checks.length>0,
    };
  });
}
export async function gather({token,repo=REPO,prNumbers=SAFE_TARGETS,fetcher=fetch}){
  if(!token)throw new Error('GITHUB_TOKEN_REQUIRED');
  if(repo!==REPO)throw new Error('REPOSITORY_FORBIDDEN');
  const base='https://api.github.com/repos/'+repo;
  async function get(path){
    const res=await fetcher(base+path,{
      headers:{authorization:'Bearer '+token,
        accept:'application/vnd.github+json',
        'x-github-api-version':'2022-11-28',
        'user-agent':'ekodi-readonly-protected-merge-diagnostics'},
    });
    const body=await res.json().catch(()=>({}));
    return {http:res.status,body:res.ok?body:{}};
  }
  const rules=await get('/rules/branches/main');
  const legacy=await get('/branches/main/protection/required_status_checks');
  const summary={
    kind:'ekodi-protected-merge-diagnostic',
    mutationPerformed:false,
    branch:'main',
    requiredNames:REQUIRED,
    effectiveRulesHttp:rules.http,
    evaluatedRequiredRules:summarizeRequiredRules(rules.body),
    legacyProtectionHttp:legacy.http,
    legacyRequiredContexts:Array.isArray(legacy.body?.contexts)?legacy.body.contexts.slice(0,40):[],
    legacyRequiredChecks:Array.isArray(legacy.body?.checks)?
      legacy.body.checks.slice(0,40).map(x=>({context:String(x.context||'').slice(0,120),appId:Number(x.app_id)||null})):[],
    prs:[],
  };
  for(const number of [...new Set(prNumbers)].slice(0,8)){
    if(!Number.isInteger(number)||number<1||number>999999)throw new Error('PR_INVALID');
    const pr=await get('/pulls/'+number);
    if(pr.http!==200){summary.prs.push({pr:number,http:pr.http});continue;}
    const result={pr:number,http:200,state:pr.body.state,mergeable:pr.body.mergeable,
      headSha:String(pr.body.head?.sha||'').slice(0,40),
      baseSha:String(pr.body.base?.sha||'').slice(0,40),
      syntheticMergeSha:String(pr.body.merge_commit_sha||'').slice(0,40),
      targets:[]};
    for(const [kind,sha] of [['head',result.headSha],['synthetic-merge',result.syntheticMergeSha]]){
      if(!/^[a-f0-9]{40}$/i.test(sha)){result.targets.push({kind,sha,missing:true});continue;}
      const [status,checks]=await Promise.all([
        get('/commits/'+sha+'/status'),
        get('/commits/'+sha+'/check-runs?per_page=100'),
      ]);
      const statuses=summarizeStatuses(status.body);
      const checkRuns=summarizeCheckRuns(checks.body);
      result.targets.push({kind,sha,statusHttp:status.http,checkRunsHttp:checks.http,
        statuses:statuses.filter(x=>REQUIRED.includes(x.context)),
        checkRuns:checkRuns.filter(x=>REQUIRED.includes(x.name)),
        requiredComparison:compareRequired(statuses,checkRuns)});
    }
    summary.prs.push(result);
  }
  return summary;
}
function activePr(){
  try{
    const evt=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
    return Number(evt?.pull_request?.number)||null;
  }catch{return null;}
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].replaceAll('\\','/').split('/').at(-1))){
  const extra=activePr();
  gather({token:process.env.GH_TOKEN,prNumbers:extra?[...SAFE_TARGETS,extra]:SAFE_TARGETS}).then(result=>{
    const output=JSON.stringify(result,null,2);
    console.log(output);
    if(process.env.GITHUB_STEP_SUMMARY){
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '### EKODI protected merge: read-only evidence\n\n'+
        'Required check-run/commit-status bindings were inspected independently. '+
        'No status, protection or branch ref was changed.\n\n'+
        'See step log JSON for exact names, GitHub-reported hashes and HTTP visibility.\n');
    }
  }).catch(e=>{
    console.error(JSON.stringify({ok:false,reason:String(e?.message||'DIAGNOSTIC_FAILED').slice(0,160)}));
    process.exitCode=1;
  });
}
