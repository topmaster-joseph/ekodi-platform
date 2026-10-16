// Phase B: deterministic, evidence-aware helpers. No network, provider, storage or generated facts.
import {reviewProposalDraft,validImportedDraft,draftToMarkdown} from './core.js';

const clean=(value,max=50000)=>String(value??'').replace(/\u0000/g,'').slice(0,max);
const esc=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABELS={period:'사업기간',totalBudget:'총사업비',owner:'추진주체',target:'사업대상',measures:'성과지표'};

export function analyzeProposalSources(model){
  if(!validImportedDraft(model))throw new Error('지원하지 않는 제안서 초안입니다.');
  const sources=(model.sources||[]).slice(0,20);
  const excerpts=[];
  const flags=[];
  for(const item of sources){
    const name=clean(item.name,1200);
    const provided=clean(item.excerpt,6000);
    const status=String(item.readStatus||'');
    if(status==='tooLarge')flags.push(name+': 용량 초과, 내용 분석 불가');
    else if(status==='unsupported')flags.push(name+': 현재 형식의 본문 분석 미지원');
    else if(status==='url'||/^https:\/\//.test(name))flags.push(name+': URL 접속·원문 확인 미실시');
    else if(!provided.trim())flags.push(name+': 본문 미입력 또는 확인 불가');
    else{
      const lines=provided.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
      for(const line of lines.slice(0,6)){
        if(excerpts.length>=30)break;
        excerpts.push({source:name,text:line.slice(0,300),verified:item.verification==='verified'});
      }
    }
  }
  if(!sources.length)flags.push('참고자료 미등록: 사용자가 입력한 아이디어만으로 초안을 구성합니다.');
  return {sourceCount:sources.length,excerpts,flags,verifiedCount:sources.filter(s=>s.verification==='verified').length};
}

const PROMPTS=Object.freeze({
  summary:'제안 대상·목적·핵심 실행안을 한 단락으로 확정하세요.',
  problem:'현황 자료와 해결 과제를 구분하고 사실마다 출처·기준기간을 확인하세요.',
  objectives:'목적, 기간, 측정 가능한 목표와 책임자를 확정하세요.',
  strategy:'대안별 장단점과 선택 근거를 작성하고 최종 결정자는 사용자가 지정하세요.',
  execution:'세부 활동·담당·일정·산출물·연계를 지정하세요.',
  budget:'총액, 산출 근거, 재원, 집행 조건을 확인하세요. 임의 예산을 만들지 않습니다.',
  governance:'역할·협약·인증·법적 책임·위험 대응을 명시하세요.',
  outcomes:'성과지표의 정의, 측정 방법, 근거, 검증 일정을 명시하세요.',
  sources:'자료명, 발행처, 작성일, URL, 표/페이지, 검증상태를 기록하세요.'
});

export function makeGuidedProposalDraft(input){
  if(!validImportedDraft(input))throw new Error('지원하지 않는 제안서 초안입니다.');
  const draft=JSON.parse(JSON.stringify(input));
  const idea=clean(draft.idea,12000).trim();
  const source=analyzeProposalSources(draft);
  const originalIdea=idea?'사용자 원문(검증 전):\n'+idea+'\n\n':'아이디어·목표 입력이 필요합니다.\n\n';
  let changed=0;
  for(const section of draft.sections){
    if(String(section.body||'').trim())continue;
    const prompt=PROMPTS[section.id]||clean(section.guide,300)||'사용자 정의 범위와 검증 자료를 입력하세요.';
    let body='[검토용 자동 구성 · 사실 미확인]\n';
    if(section.id==='summary')body+=originalIdea;
    else if(section.id==='problem'&&source.excerpts.length){
      body+='참고자료에서 발췌한 문장(원문 검증·맥락 확인 필요):\n';
      for(const evidence of source.excerpts.slice(0,4))body+='- '+clean(evidence.text,240)+' [자료: '+clean(evidence.source,240)+']\n';
      body+='\n';
    }else if(section.id==='sources'){
      body+=source.sourceCount?'등록 참고자료(내용·발행정보 검증 전):\n':'참고자료 없음\n';
      for(const item of (draft.sources||[]).slice(0,20))body+='- '+clean(item.name,1200)+' (검증 전)\n';
      body+='\n';
    }
    body+='확인하고 작성할 사항: '+prompt+'\n';
    body+='최종 수치·일정·계약·대외제출 내용은 근거 확인과 사용자 결정 후 확정';
    section.body=body.slice(0,50000);changed++;
  }
  draft.phase='guided_draft_unverified';
  return {draft,changed,sourceAnalysis:source};
}

export function calculateProposalBudget(rows){
  if(!Array.isArray(rows)||rows.length>50)throw new Error('예산 항목은 최대 50건입니다.');
  if(rows.length===0)throw new Error('예산 항목을 1건 이상 입력하세요.');
  let total=0;
  const items=rows.map((item,index)=>{
    const name=clean(item?.name,120).trim();
    const unit=clean(item?.unit||'식',20).trim();
    const quantity=Number(item?.quantity);
    const unitCost=Number(item?.unitCost);
    if(!name)throw new Error((index+1)+'번째 예산 항목명이 필요합니다.');
    if(!Number.isFinite(quantity)||quantity<=0||quantity>100000000||!Number.isFinite(unitCost)||unitCost<0||!Number.isSafeInteger(unitCost))
      throw new Error(name+': 수량 또는 단가가 올바르지 않습니다.');
    if(Math.abs(quantity-Math.round(quantity*10000)/10000)>1e-8)throw new Error(name+': 수량은 소수점 4자리 이내로 입력하세요.');
    const amount=quantity*unitCost;
    if(!Number.isSafeInteger(amount)||amount>1e14)throw new Error(name+': 금액은 안전한 정수 원 단위로 계산되어야 합니다.');
    total+=amount;
    if(!Number.isSafeInteger(total)||total>1e14)throw new Error('총액 계산 범위를 초과했습니다.');
    return {name,unit,quantity,unitCost,amount};
  });
  return {currency:'KRW',items,total,assurance:'사용자가 입력한 산식 검증만 완료. 실제 견적 또는 재원 확정 아님'};
}


export function proposalToMarkdownWithBudget(model){
  let output=draftToMarkdown(model);
  const rows=Array.isArray(model.budgetRows)?model.budgetRows:[];
  if(!rows.length)return output;
  const calc=calculateProposalBudget(rows);
  output+='\n## 사용자 입력 예산 산출표\n\n| 항목 | 수량 | 단위 | 단가(원) | 금액(원) |\n|---|---:|---|---:|---:|\n';
  const plain=v=>String(v??'').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
  for(const item of calc.items)output+='| '+plain(item.name)+' | '+item.quantity+' | '+plain(item.unit)+' | '+item.unitCost+' | '+item.amount+' |\n';
  output+='| **입력 합계** | | | | **'+calc.total+'** |\n\n';
  const check=reviewProposalBudget(model);
  for(const warning of check.warnings)output+='> 예산 확인: '+plain(warning)+'\n';
  output+='> 실제 견적 및 재원 확인 전의 계산값입니다.\n';
  return output;
}

export function proposalBudgetToCsv(rows){
  const calc=calculateProposalBudget(rows);
  function cell(v){
    const raw=String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,250);
    const safe=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;
    return '"'+safe.replace(/"/g,'""')+'"';
  }
  const lines=[['항목','수량','단위','단가(원)','금액(원)'].map(cell).join(',')];
  for(const r of calc.items)lines.push([r.name,r.quantity,r.unit,r.unitCost,r.amount].map(cell).join(','));
  lines.push(['사용자 입력 합계','','','',calc.total].map(cell).join(','));
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}

export function parseKrwAmount(raw){
  const value=clean(raw,80).trim();
  const match=value.match(/^([\d,]+(?:\.\d+)?)\s*(억원|만원|원)?$/);
  if(!match)return null;
  const base=Number(match[1].replace(/,/g,''));
  if(!Number.isFinite(base)||base<0)return null;
  const ratio=match[2]==='억원'?100000000:match[2]==='만원'?10000:1;
  const total=base*ratio;
  return Number.isSafeInteger(total)?total:null;
}

export function reviewProposalBudget(model){
  const rows=Array.isArray(model.budgetRows)?model.budgetRows:[];
  if(!rows.length)return {applicable:false,warnings:['예산 산출행 미등록: 총사업비와 근거를 확인하세요.']};
  const calc=calculateProposalBudget(rows);
  const declared=parseKrwAmount(model.decisions?.totalBudget||'');
  const warnings=[];
  if(declared===null)warnings.push('총사업비 숫자와 단위(원/만원/억원)를 확정하면 산출액과 비교합니다.');
  else if(declared!==calc.total)warnings.push('총사업비 입력액과 예산 산출합계가 일치하지 않습니다: 차이 '+(declared-calc.total).toLocaleString('ko-KR')+'원');
  return {applicable:true,calculation:calc,declaredAmount:declared,warnings,matched:declared!==null&&declared===calc.total};
}

export function proposalToPrintHtml(model){
  if(!validImportedDraft(model))throw new Error('지원하지 않는 제안서 초안입니다.');
  const checked=reviewProposalDraft(model);
  const metadata=Object.entries(LABELS).map(([key,label])=>'<tr><th>'+esc(label)+'</th><td>'+esc(model.decisions?.[key]||'확인 필요')+'</td></tr>').join('');
  const sections=model.sections.map((s,i)=>'<section><h2>'+(i+1)+'. '+esc(s.name)+'</h2><div class="body">'+esc(s.body||'작성 내용 확인 필요')+'</div></section>').join('');
  const rows=Array.isArray(model.budgetRows)?model.budgetRows:[];
  let budgetHtml='';
  if(rows.length){
    const c=calculateProposalBudget(rows);
    budgetHtml='<section><h2>예산 산출표 (사용자 입력)</h2><table><tr><th>항목</th><th>수량</th><th>단위</th><th>단가(원)</th><th>금액(원)</th></tr>';
    for(const r of c.items)budgetHtml+='<tr><td>'+esc(r.name)+'</td><td>'+r.quantity+'</td><td>'+esc(r.unit)+'</td><td>'+r.unitCost+'</td><td>'+r.amount+'</td></tr>';
    budgetHtml+='<tr><td>입력 합계</td><td></td><td></td><td></td><td>'+c.total+'</td></tr></table></section>';
  }
  const warning=checked.issues.length?'<p class="warn">제출 전 확인 '+checked.issues.length+'건: '+esc(checked.issues.slice(0,8).join(' · '))+'</p>':'<p class="warn">기초 항목 검사 통과: 사실·양식·예산·인증 최종 검증은 별도입니다.</p>';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(model.title)+' — EKODI 검토용 제안서</title><style>@page{size:A4;margin:18mm}body{font-family:system-ui,Arial,sans-serif;color:#111;max-width:820px;margin:30px auto;padding:12px;font-size:14px;line-height:1.7}h1{font-size:27px;letter-spacing:-.04em}h2{font-size:17px;margin-top:32px;padding-bottom:6px;border-bottom:1px solid #222}small,.muted{color:#666}.warn{border:1px solid #bbb;padding:12px;background:#fafafa;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5;width:22%}.body{white-space:pre-wrap;overflow-wrap:anywhere}section{break-inside:avoid-page}@media print{body{margin:0;padding:0}.warn{background:white}}</style></head><body><small>EKODI PROPOSAL STUDIO | 검토용 초안 · 자동 제출 금지</small><h1>'+esc(model.title)+'</h1><p class="muted">분야 '+esc(model.domain)+' · 목적 '+esc(model.goal)+'</p>'+warning+'<h2>사업 기본정보</h2><table>'+metadata+'</table>'+budgetHtml+sections+'<p class="muted">출처·원본 양식·수치의 사실성에 대해 사용자 최종 검증이 필요합니다.</p></body></html>';
}

export function proposalToPresentationMd(model){
  if(!validImportedDraft(model))throw new Error('지원하지 않는 제안서 초안입니다.');
  const parts=['# '+clean(model.title,160)+' · 발표 구성 초안','','> 작성자 검토 전 대외사용 금지 · 자료 사실 미검증'];
  const outline=[
    ['문제 제기',['problem']],['제안 목표',['objectives']],['핵심 전략',['strategy']],['세부 실행',['execution']],
    ['사업 운영',['governance']],['예산·재원',['budget','revenue']],['기대 성과',['outcomes','impact']],
    ['해당 분야 특화',['market','policy','curriculum','community','architecture']],
    ['참고 근거와 한계',['sources']],['결정·협의 필요사항',['summary']]
  ];
  let i=1;
  for(const [heading,ids] of outline){
    const matches=(model.sections||[]).filter(s=>ids.includes(s.id));
    if(!matches.length)continue;
    parts.push('','## 슬라이드 '+i+': '+heading,'');
    for(const s of matches)parts.push('**'+clean(s.name,100)+'**','',clean(s.body,1200)||'구체적 내용 작성 및 확인 필요','');
    parts.push('발표 메모: 수치, 인용, 지원요건의 원자료 검증 필요.');i++;
  }
  return parts.join('\n')+'\n';
}
