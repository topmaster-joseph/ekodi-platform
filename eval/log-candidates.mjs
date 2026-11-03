// EKODI Eval Lab — offline review-candidate extraction, never a direct golden-set promotion.
// This tool does not log or persist original prompts. Mapping stays on a protected device.
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, unlinkSync} from 'node:fs';
import {resolve, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const KOREAN=/[가-힣]/u;
const CATEGORY_RULES=Object.freeze([
  ['ai-routing',/AI|인공지능|모델|라우팅|에이전트|오케스트레이터/i],
  ['marketing',/마케팅|홍보|광고|콘텐츠|게시|릴스|유튜브/i],
  ['commerce',/상품|판매|소싱|도매|쇼핑|발주|몰/i],
  ['admin',/관리자|설정|권한|메뉴|접근|로그인/i],
  ['research',/논문|연구|분석|보고서|통계/i],
  ['publishing',/출판|원고|집필|도서|책|오디오북/i],
  ['community',/선교|교회|모임|묵상|교육|행사/i],
  ['technology',/개발|코딩|저장소|배포|오류|테스트|시스템/i],
]);
const ACTION_RULES=Object.freeze([
  ['verify',/검증|확인|점검|분석|검사/i],
  ['improve',/개선|수정|최적화|변경|고쳐/i],
  ['create',/구축|제작|생성|작성|개발|만들/i],
  ['organize',/정리|등록|관리|분류|보관/i],
  ['connect',/연결|통합|연동|이관/i],
]);

const categoryOf=goal=>CATEGORY_RULES.find(([,rule])=>rule.test(goal))?.[0]||'general';
const actionOf=goal=>ACTION_RULES.find(([,rule])=>rule.test(goal))?.[0]||'review';
const safeState=x=>/^[a-z][a-z_]{0,29}$/.test(String(x))?String(x):'unknown';
const safeRisk=x=>['low','normal','medium','high','critical'].includes(String(x))?String(x):'unknown';
const digest=x=>createHash('sha256').update(x).digest('hex');

export function createReviewBatch(rows,{total=50,holdoutCount=10,idFactory=randomUUID}={}){
  if(!Array.isArray(rows)||!Number.isInteger(total)||total<50||!Number.isInteger(holdoutCount)||holdoutCount<1||holdoutCount>=total)throw Error('EVAL_CANDIDATE_CONFIG');
  const unique=new Map();
  for(const row of rows){
    const goal=String(row?.goal||'').trim().normalize('NFC');
    if(!KOREAN.test(goal)||goal.length<12||goal.length>8000||!row?.id)continue;
    const key=digest(goal); // transient in-memory dedup; never exported
    if(unique.has(key))continue;
    unique.set(key,{id:String(row.id),goal,category:categoryOf(goal),action:actionOf(goal),state:safeState(row.state),risk:safeRisk(row.risk)});
  }
  if(unique.size<total)throw Error('INSUFFICIENT_DISTINCT_KOREAN_LOG_CASES');
  const buckets=new Map();
  for(const row of unique.values()){const bucket=buckets.get(row.category)||[];bucket.push(row);buckets.set(row.category,bucket)}
  const preference={verified:0,degraded:1,human_gate:2,core_only:3,executor_ready:4,queued:5};
  for(const bucket of buckets.values())bucket.sort((a,b)=>(preference[a.state]??8)-(preference[b.state]??8)||a.id.localeCompare(b.id));
  const chosen=[],categories=[...buckets.keys()].sort((a,b)=>a.localeCompare(b));
  while(chosen.length<total){
    let advanced=false;
    for(const category of categories){
      const bucket=buckets.get(category);if(!bucket.length)continue;
      chosen.push(bucket.shift());advanced=true;if(chosen.length>=total)break;
    }
    if(!advanced)break;
  }
  if(chosen.length!==total)throw Error('INSUFFICIENT_DIVERSITY');
  const calibration=[],holdout=[],mapping=[];
  chosen.forEach((row,i)=>{
    const id='eval-review-'+idFactory();
    const candidate={id,language:'ko',source:'production-ai-command-tasks',
      intentClass:row.category,actionClass:row.action,observedState:row.state,riskClass:row.risk,
      // A generic safe template cannot be used as a faithful goal or independent answer.
      reviewTemplate:`한국어 ${row.category} 업무에서 ${row.action} 요청의 라우팅을 평가한다.`,
      expectedRoute:null,expectedToolCalls:null,trajectory:null,
      humanPrivacyReviewRequired:true,humanLabelReviewRequired:true,eligibleForGolden:false};
    const split=i%Math.floor(total/holdoutCount)===0&&holdout.length<holdoutCount?'holdout-candidate':'calibration-candidate';
    mapping.push({candidateId:id,sourceId:row.id,split});
    if(split==='holdout-candidate')holdout.push(candidate);else calibration.push(candidate);
  });
  if(holdout.length!==holdoutCount||calibration.length!==total-holdoutCount)throw Error('CANDIDATE_SPLIT');
  return {calibration,holdout,mapping,sourceUniqueCount:unique.size};
}

function main(){
  const [inputPath,outputPath,option]=process.argv.slice(2);
  if(!inputPath||!outputPath||option!=='--delete-input')throw Error('usage: node eval/log-candidates.mjs RAW_D1_JSON_OR_STDIN_DASH PRIVATE_OUTPUT_DIR --delete-input');
  const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
  const out=resolve(outputPath),src=inputPath==='-'?null:resolve(inputPath);
  if(out===root||out.startsWith(root+sep))throw Error('PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  if(src&&(src===root||src.startsWith(root+sep)))throw Error('RAW_INPUT_MUST_BE_OUTSIDE_REPOSITORY');
  try{
    // "-" reads the D1 pipe directly: raw task bodies never touch the filesystem.
    const parsed=JSON.parse(readFileSync(src||0,'utf8').replace(/^\\uFEFF/,''));
    const rows=Array.isArray(parsed)?(parsed[0]?.results||parsed):parsed.results;
    const batch=createReviewBatch(rows||[]);
    mkdirSync(out,{recursive:true,mode:0o700});
    const save=(name,data)=>writeFileSync(resolve(out,name),data.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600,flag:'wx'});
    save('calibration-review.jsonl',batch.calibration);
    save('holdout-review.jsonl',batch.holdout);
    save('source-linkage-private.jsonl',batch.mapping);
    process.stdout.write(JSON.stringify({status:'quarantined-awaiting-review',calibration:batch.calibration.length,holdout:batch.holdout.length,uniqueSourceGoals:batch.sourceUniqueCount,outputFolder:basename(out)})+'\n');
  }finally{if(src)try{unlinkSync(src)}catch{}}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{main()}catch(error){console.error('EKODI candidate extraction stopped:',error?.message?.replace(/\\|\//g,'_').slice(0,90)||'unknown');process.exitCode=1}
}
