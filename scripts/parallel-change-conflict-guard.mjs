import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReviewScopes, semanticScopeOverlaps } from './detect-related-change-overlap.mjs';

const argValue=name=>{
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:'';
};
const labelsOf=pr=>new Set((pr?.labels?.nodes||[]).map(item=>String(item?.name||'')));
const filesOf=pr=>(pr?.files?.nodes||[]).map(item=>String(item?.path||'')).filter(Boolean);
const bodiesOf=current=>[
  String(current?.body||''),
  ...(current?.comments?.nodes||[]).map(item=>String(item?.body||'')),
  ...(current?.reviews?.nodes||[]).map(item=>String(item?.body||'')),
].join('\n');
const hasNext=connection=>Boolean(connection?.pageInfo?.hasNextPage);
const esc=value=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');

export function evaluateConflictSnapshot(snapshot,{config,prNumber,baseRef,headRef}){
  const repository=snapshot?.data?.repository;
  const current=repository?.current;
  const open=repository?.open;
  const errors=[];
  if(!repository||!current||!open)errors.push('CONFLICT_GUARD_SNAPSHOT_INCOMPLETE');
  if(hasNext(open))errors.push('OPEN_PR_PAGE_LIMIT_REACHED');
  for(const [name,connection] of [['current.files',current?.files],['current.labels',current?.labels],['current.comments',current?.comments],['current.reviews',current?.reviews]]){
    if(hasNext(connection))errors.push(`${name.toUpperCase().replaceAll('.','_')}_PAGE_LIMIT_REACHED`);
  }
  const candidates=(open?.nodes||[]).filter(item=>Number(item?.number)!==Number(prNumber)&&String(item?.baseRefName||'')===String(baseRef||''));
  for(const item of candidates){
    if(hasNext(item?.files))errors.push(`PR_${item.number}_FILES_PAGE_LIMIT_REACHED`);
    if(hasNext(item?.labels))errors.push(`PR_${item.number}_LABELS_PAGE_LIMIT_REACHED`);
  }
  if(errors.length)return{ok:false,errors,summary:['## EKODI parallel conflict guard',`- Current PR: #${prNumber}`,...errors.map(error=>`- FAIL-CLOSED: \`${error}\``)].join('\n')};

  const currentFiles=filesOf(current);
  const currentSet=new Set(currentFiles);
  const exact=[];
  const semantic=[];
  const related=new Map([[Number(prNumber),current]]);
  for(const other of candidates){
    const otherFiles=filesOf(other);
    const overlap=otherFiles.filter(file=>currentSet.has(file));
    if(overlap.length){
      related.set(Number(other.number),other);
      for(const file of overlap)exact.push({number:Number(other.number),branch:other.headRefName,file});
    }
    for(const item of semanticScopeOverlaps(currentFiles,otherFiles,config)){
      related.set(Number(other.number),other);
      semantic.push({number:Number(other.number),branch:other.headRefName,...item});
    }
  }

  const lines=['## EKODI parallel conflict guard',`- Current PR: #${prNumber}`,`- Branch: \`${headRef}\``,`- Base: \`${baseRef}\``];
  if(!exact.length&&!semantic.length){
    lines.push('- Result: no exact-file or configured related-change overlap with other open PRs.');
  }else{
    if(exact.length){
      lines.push('','### Exact file overlaps','| Other PR | Branch | Overlapping file |','|---:|---|---|');
      for(const row of exact)lines.push(`| #${row.number} | \`${esc(row.branch)}\` | \`${esc(row.file)}\` |`);
    }
    if(semantic.length){
      lines.push('','### Related-change overlaps','| Other PR | Branch | Shared scope | Current files | Other files |','|---:|---|---|---|---|');
      for(const row of semantic)lines.push(`| #${row.number} | \`${esc(row.branch)}\` | \`${esc(row.scope)}\` | \`${esc(row.leftFiles.join(','))}\` | \`${esc(row.rightFiles.join(','))}\` |`);
    }
    const relatedNumbers=[...related.keys()].sort((a,b)=>a-b);
    lines.push(`- Related PRs: ${relatedNumbers.join(',')}`);
    const approved=relatedNumbers.filter(number=>labelsOf(related.get(number)).has(config.integrationOrderLabel));
    const currentLabels=labelsOf(current);
    const evidence=bodiesOf(current);
    const reviewComplete=currentLabels.has(config.reviewCompleteLabel);
    const evidenceComplete=evidence.includes(config.reviewEvidenceMarker)&&relatedNumbers.filter(number=>number!==Number(prNumber)).every(number=>evidence.includes(`#${number}`));
    if(approved.length===1&&approved[0]===Number(prNumber)&&reviewComplete&&evidenceComplete){
      lines.push(`- Mutual review: verified via \`${config.reviewCompleteLabel}\` and ${config.reviewEvidenceMarker} evidence covering every related PR.`);
      lines.push(`- Integration order: current PR is the single centrally approved winner via \`${config.integrationOrderLabel}\`.`);
      lines.push('- Result: ALLOWED to merge first. Every overlapping or related open PR must refresh/rebase on main after this winner merges and rerun validation.');
    }else{
      if(approved.length>1)errors.push('MULTIPLE_INTEGRATION_WINNERS');
      else if(approved.length===1&&approved[0]!==Number(prNumber))errors.push(`INTEGRATION_WINNER_IS_${approved[0]}`);
      else if(approved.length===0)errors.push('NO_INTEGRATION_WINNER');
      if(!reviewComplete)errors.push('RELATED_CHANGE_REVIEW_LABEL_MISSING');
      if(!evidenceComplete)errors.push('RELATED_CHANGE_REVIEW_EVIDENCE_INCOMPLETE');
      for(const error of errors)lines.push(`- FAIL-CLOSED: \`${error}\``);
    }
  }

  lines.push('','### GitHub merge signal',`- mergeable: \`${current?.mergeable||'UNKNOWN'}\``,`- mergeable_state: \`${current?.mergeStateStatus||'UNKNOWN'}\``);
  if(current?.mergeable==='CONFLICTING')errors.push('ACTUAL_MERGE_CONFLICT');
  return{ok:errors.length===0,errors,summary:lines.join('\n'),related:[...related.keys()].sort((a,b)=>a-b)};
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const snapshotFile=argValue('--snapshot');
  const configFile=argValue('--config');
  const prNumber=Number(argValue('--pr'));
  const baseRef=argValue('--base');
  const headRef=argValue('--head');
  const summaryFile=argValue('--summary')||process.env.GITHUB_STEP_SUMMARY||'';
  if(!snapshotFile||!configFile||!prNumber||!baseRef)throw new Error('Usage: --snapshot <json> --config <json> --pr <number> --base <ref> [--head <ref>] [--summary <file>]');
  const snapshot=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));
  const config=loadReviewScopes(configFile);
  const result=evaluateConflictSnapshot(snapshot,{config,prNumber,baseRef,headRef});
  if(summaryFile)fs.appendFileSync(summaryFile,result.summary+'\n');
  console.log(result.summary);
  if(!result.ok)process.exit(1);
}
