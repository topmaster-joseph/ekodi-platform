// Independent, GET-only production evidence for the Church homepage inline editor.
// Does not authenticate a user, mutate a post, or issue any release authority.
// The guarded Church Pages workflow remains the sole deployment owner.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export const CHURCH_ORIGIN='https://ekodi.kr';
export const CHURCH_SOURCE_REPO='topmaster-joseph/ekodi-church';
const FIELDS=Object.freeze([
  {path:'/ekodichurch/church-release.json',key:'release'},
  {path:'/ekodichurch/',key:'home'},
  {path:'/ekodichurch/notices/',key:'notices'},
  {path:'/ekodichurch/schedule/',key:'schedule'},
  {path:'/ekodichurch/church-public-updates.js',key:'editor'},
  {path:'/ekodichurch/church-public-updates.css',key:'style'},
  {path:'/ekodichurch/church-shared-schedules.js',key:'shared'}
]);
const SHA=/^[0-9a-f]{40}$/;
const fail=message=>{throw new Error('church_inline_production_verification_failed: '+message);};

function requireMarkup(html,pattern,name){
  if(!pattern.test(html))fail('missing '+name);
}
export async function verifyChurchInlineProduction({
  expectedSourceSha,fetchImpl=fetch,origin=CHURCH_ORIGIN,now=()=>new Date().toISOString()
}={}){
  assert.match(String(expectedSourceSha||''),SHA,'A pinned, approved Church source SHA is required');
  assert.equal(origin,CHURCH_ORIGIN,'Production verification must use the canonical ekodi.kr origin');
  const sources={};
  const reads=[];
  for(const field of FIELDS){
    const url=new URL(field.path,origin);
    url.searchParams.set('release',expectedSourceSha);
    const response=await fetchImpl(url.href,{
      method:'GET',headers:{accept:field.key==='release'?'application/json':'text/html, text/css, application/javascript, */*'},
      cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(12000)
    });
    if(!response||response.status!==200)fail(field.path+' returned '+String(response?.status));
    // Read a bounded response. The caller must not leak credentials to a public GET.
    const data=await response.text();
    if(data.length>2_000_000)fail('oversized response '+field.path);
    sources[field.key]=data;
    reads.push({path:field.path,status:response.status});
  }
  let marker;
  try{marker=JSON.parse(sources.release);}catch{fail('invalid release marker');}
  if(marker.sourceRepository!==CHURCH_SOURCE_REPO)fail('wrong source owner');
  if(marker.sourceSha!==expectedSourceSha)fail('deployed SHA mismatch');
  if(!['ekodi.church-release.v1','ekodi.church-release.v2'].includes(marker.contract))fail('unknown release contract');

  requireMarkup(sources.home,/data-church-inline-manage="notices"[^>]*\shidden(?=[\s>])/,'default-hidden notices manager button');
  requireMarkup(sources.home,/data-church-inline-manage="schedule"[^>]*\shidden(?=[\s>])/,'default-hidden schedule manager button');
  requireMarkup(sources.home,/data-church-public-manage\b[^>]*data-church-home-manage\b[^>]*\shidden(?=[\s>])/,'default-hidden home editor panel');
  requireMarkup(sources.home,/data-church-role-diagnostic\b[^>]*\shidden(?=[\s>])/,'default-hidden self-role diagnostic');
  requireMarkup(sources.home,/src="church-public-updates\.js"/,'homepage authorized editor runtime');
  requireMarkup(sources.home,/data-church-shared-schedules\b/,'shared Church/Mission calendar');
  requireMarkup(sources.home,/href="\/ekodichurch\/notices\/"/,'canonical notices link');
  requireMarkup(sources.home,/href="\/ekodichurch\/schedule\/"/,'canonical schedule link');
  requireMarkup(sources.notices,/data-church-public-page="notices"/,'notices direct route');
  requireMarkup(sources.schedule,/data-church-public-page="schedule"/,'schedule direct route');
  requireMarkup(sources.editor,/result\.authenticated!==true/,'server verified authentication');
  requireMarkup(sources.editor,/result\.manage!==true/,'server verified management');
  requireMarkup(sources.editor,/function explainRole\(kind=''/,'non-escalating self-role diagnostic');
  requireMarkup(sources.editor,/explainRole\('unauthorized'\)/,'member permission explanation');
  requireMarkup(sources.editor,/\['owner','admin','moderator'\]/,'board manager role allowlist');
  requireMarkup(sources.editor,/church:public-content-updated/,'post-write public content refresh');
  requireMarkup(sources.editor,/function revokeEditor\(\)/,'revocation guard');
  requireMarkup(sources.editor,/source==='board'/,'Church-only schedule editing');
  requireMarkup(sources.shared,/published-read-only/,'read-only Church/Mission federation');
  requireMarkup(sources.style,/church-home-manage-toggle/,'inline control presentation');
  // These are source/markup integrity checks, NOT an actual authenticated administrator session.
  return Object.freeze({
    ok:true,mode:'production-read-only-source-and-guest-markup',
    origin,sourceRepository:marker.sourceRepository,
    verifiedSourceSha:marker.sourceSha,releaseContract:marker.contract,
    checks:['exact-release-source','homepage-manager-default-hidden','self-role-diagnostic-default-hidden','official-routes','server-role-allowlist',
      'church-owned-edit-scope','cross-institution-read-only-federation','public-refresh-signal'],
    realUserAuthenticated:false,dataMutations:false,loggedInCrudVerified:false,
    inspectedAt:now(),reads
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const index=process.argv.indexOf('--expect-source-sha');
  const expectedSourceSha=index<0?'':process.argv[index+1];
  verifyChurchInlineProduction({expectedSourceSha})
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(String(error?.message||error));process.exitCode=1;});
}
