const clean=(value,max=4000)=>String(value??'').replace(/\r/g,'').trim().slice(0,max);
const list=value=>Array.isArray(value)?value:[];
function fnv1a(value){let hash=0x811c9dc5;for(const ch of String(value||'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,0x01000193)}return (hash>>>0).toString(36)}
function normalize(value){return clean(value).replace(/\s+/g,' ').normalize('NFKC')}
function changeDetector(input={}){const before=normalize(input.beforeText),after=normalize(input.afterText);const beforeHash=fnv1a(before),afterHash=fnv1a(after);const max=Math.max(before.length,after.length,1);const delta=Math.abs(after.length-before.length)/max;return {ok:true,beforeHash,afterHash,changed:beforeHash!==afterHash,sizeChangePct:Math.round(delta*1000)/10}}
function languageProfile(input={}){const text=clean(input.afterText||input.beforeText);const counts={hangul:0,japanese:0,han:0,latin:0,other:0};for(const ch of text){const cp=ch.codePointAt(0);if(/[가-힣]/u.test(ch))counts.hangul++;else if((cp>=0x3040&&cp<=0x30ff))counts.japanese++;else if((cp>=0x4e00&&cp<=0x9fff))counts.han++;else if(/[A-Za-z]/.test(ch))counts.latin++;else if(!/\s|[0-9.,:;!?()[\]{}'"\-~·]/u.test(ch))counts.other++}const ordered=[['ko',counts.hangul],['ja',counts.japanese],['zh',counts.han],['en',counts.latin]].sort((a,b)=>b[1]-a[1]);return {ok:true,dominant:ordered[0][1]>0?ordered[0][0]:'unknown',counts}}
function structureExtractor(input={}){const text=clean(input.afterText||input.beforeText);const lines=text.split(/\n+/).map(v=>v.trim()).filter(Boolean);const bullets=lines.filter(v=>/^[-*•]|^\d+[.)]\s/.test(v));const sentences=text.split(/[.!?。！？]+/u).map(v=>v.trim()).filter(Boolean);return {ok:true,title:lines[0]||'',lineCount:lines.length,bulletCount:bullets.length,sentenceCount:sentences.length,preview:lines.slice(0,4)}}
function provenanceCheck(input={}){const source=input.source||{};let url=null;try{url=new URL(String(source.url||''))}catch{}const trusted=new Set(['ekodi_canonical','official_primary','authoritative_reference']);const authority=String(source.authority||'user_supplied');const https=url?.protocol==='https:';const rights=source.rightsAllowed===true;const dated=Number.isFinite(Date.parse(String(source.publishedAt||'')));const score=(https?30:0)+(rights?30:0)+(trusted.has(authority)?30:authority==='user_supplied'?15:5)+(dated?10:0);return {ok:https&&rights,score,https,rightsAllowed:rights,authority,publishedAt:dated?String(source.publishedAt):null}}
function capabilityComposer(input={},context={}){const requested=list(context.recipe?.capabilities).map(String);const registered=new Set(list(context.registry?.capabilities).concat(list(context.registry?.fabricCapabilities)).map(item=>String(item?.id||'')));const missing=requested.filter(id=>!registered.has(id));return {ok:requested.length>0&&missing.length===0,requested,missing,registeredCount:registered.size}}
const MODULES=Object.freeze({
  'source.change-detector':changeDetector,
  'text.language-profile':languageProfile,
  'content.structure-extractor':structureExtractor,
  'verification.provenance-check':provenanceCheck,
  'workflow.capability-composer':capabilityComposer,
});
export const CAPABILITY_SAMPLE_POLICY=Object.freeze({version:'1.0.0',dataPolicy:'synthetic_only',sideEffects:'none',externalNetwork:false,productionWrites:false,persistsInputs:false,serviceCreationAutomatic:false});
export function runCapabilitySample({recipe,registry,input}={}){
  if(!recipe||typeof recipe!=='object')return {state:'sample_blocked',reason:'recipe_required',serviceCreated:false,userServiceReady:false};
  const payload=input&&typeof input==='object'?input:recipe.sampleInput||{};
  if(payload.synthetic!==true)return {state:'sample_blocked',reason:'synthetic_input_required',serviceCreated:false,userServiceReady:false};
  const results=[];for(const moduleId of list(recipe.modules)){const fn=MODULES[moduleId];if(!fn){results.push({moduleId,ok:false,error:'module_not_implemented'});continue}try{const output=fn(payload,{recipe,registry});results.push({moduleId,ok:output?.ok===true,output})}catch(error){results.push({moduleId,ok:false,error:clean(error?.message||error,300)})}}
  const capabilityResult=results.find(item=>item.moduleId==='workflow.capability-composer');
  const verified=results.length>0&&results.every(item=>item.ok===true)&&capabilityResult?.output?.missing?.length===0;
  const structure=results.find(item=>item.moduleId==='content.structure-extractor')?.output||{};
  const language=results.find(item=>item.moduleId==='text.language-profile')?.output||{};
  const change=results.find(item=>item.moduleId==='source.change-detector')?.output||{};
  const provenance=results.find(item=>item.moduleId==='verification.provenance-check')?.output||{};
  return {
    contract:'ekodi.capability-sample.v1',
    recipeId:String(recipe.id||''),
    recipeName:String(recipe.name||recipe.id||''),
    state:verified?'sample_verified':'sample_blocked',
    generatedAt:new Date().toISOString(),
    policy:CAPABILITY_SAMPLE_POLICY,
    modules:results,
    capabilities:capabilityResult?.output||{requested:list(recipe.capabilities),missing:[]},
    preview:{title:structure.title||recipe.name||'',language:language.dominant||'unknown',changed:change.changed??null,sourceScore:provenance.score??null,lines:structure.preview||[]},
    evidence:{syntheticOnly:true,moduleCount:results.length,passedModules:results.filter(item=>item.ok).length,productionMutation:false,externalExecution:false,persisted:false},
    serviceCreated:false,
    userServiceReady:false,
    next:verified?'accumulate_verified_sample_runs_then_wait_for_user_request_or_measured_need':'fix_sample_or_module_contract'
  };
}
export function availableSampleModules(){return Object.keys(MODULES)}
