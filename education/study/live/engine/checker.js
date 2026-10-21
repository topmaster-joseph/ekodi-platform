// EKODI Education Live — rule-based AI output checker (no AI, no network).
// Compares a learner's pasted AI result with the fictional source text and flags the error types this course
// teaches: invented numbers/dates, invented contacts/links, undecided items stated as decided, missing
// [확인 필요] markers, and source facts that disappeared. It is a practice aid, not a grader: a human decides.

const NUM_UNIT='(?:%|퍼센트|원|만\\s?원|억\\s?원|명|건|개|장|쪽|과제|회차|회|석|점|시간|분|초|학년도|학점|일|월|년|주)';
const RE_TIME=/\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const RE_MONTH_DAY=/(\d{1,2})\s?월\s?(\d{1,2})\s?일/g;
const RE_NUM_UNIT=new RegExp('(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s?('+NUM_UNIT+')','g');
const RE_PHONE=/(?:\+?82[-\s]?)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}/g;
const RE_URL=/\bhttps?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/gi;
const RE_EMAIL=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UNDECIDED=/(보류|검토\s?중|협의\s?중|미정|확인\s?중|미확정|추정|결정하(?:죠|자|기로)|듣고\s?(?:확정|결정)|후\s?(?:확정|결정)|예산\s?확인|답이\s?오면)/;
const DECIDED_OUT=/(확정|결정됨|결정되었|확정되었|확정함|확정입니다|확정됨)/;
const MARKER=/\[?\s*확인\s?필요\s*\]?|\[\s*검토\s?중\s*\]|\[\s*검증\s?필요\s*\]/;
const MISSING_CUE=/(미정|미상|없음|확인\s?중|금액\s?미정|내선\s?번호\s?미정|검토\s?중|협의\s?중)/;

const uniq=list=>Array.from(new Set(list));
const normNum=s=>String(s).replace(/,/g,'').replace(/\s+/g,'').replace('퍼센트','%');

export function extractFacts(text){
  const t=String(text||'');
  const times=uniq([...t.matchAll(RE_TIME)].map(m=>String(Number(m[1]))+':'+m[2]));
  const dates=uniq([...t.matchAll(RE_MONTH_DAY)].map(m=>Number(m[1])+'월'+Number(m[2])+'일'));
  const withoutDates=t.replace(/\d+\s?점\s?만점/g,' ').replace(RE_MONTH_DAY,' ').replace(RE_TIME,' ');
  const numbers=uniq([...withoutDates.matchAll(RE_NUM_UNIT)].map(m=>normNum(m[1]+m[2])));
  const phones=uniq((t.match(RE_PHONE)||[]).map(s=>s.replace(/[\s.]/g,'-')));
  const urls=uniq(t.match(RE_URL)||[]);
  const emails=uniq(t.match(RE_EMAIL)||[]);
  return {times,dates,numbers,phones,urls,emails};
}

// Numbers can be expressed differently (3,000만 원 vs 3000만원). Compare on the normalized numeric part + unit.
function inSource(value,sourceFacts,sourceText){
  if(sourceFacts.includes(value))return true;
  const digits=value.replace(/[^\d.]/g,'');
  return digits.length>0&&new RegExp('(^|[^\\d.])'+digits.replace('.','\\.')+'(?![\\d])').test(String(sourceText).replace(/,/g,''));
}

export function checkOutput(source,output){
  const src=String(source||''),out=String(output||'');
  const findings=[];
  if(out.trim().length<10)return {findings:[{level:'info',type:'empty',title:'점검할 결과가 짧습니다',detail:'FactChat 결과를 붙여 넣은 뒤 다시 점검하세요.'}],summary:{risk:0,warn:0,info:1}};
  const S=extractFacts(src),O=extractFacts(out);
  const added=[];
  for(const v of O.dates)if(!S.dates.includes(v))added.push(v.replace('월','월 '));
  for(const v of O.times)if(!S.times.includes(v))added.push(v);
  for(const v of O.numbers)if(!inSource(v,S.numbers,src))added.push(v);
  if(added.length)findings.push({level:'risk',type:'invented-number',title:'원문에 없는 날짜·시간·수치',detail:uniq(added).slice(0,12).join(', ')+' — 원문에 없는 값입니다. AI가 계산한 값이면 직접 검산하고, 아니면 지우거나 [확인 필요]로 바꾸세요.'});
  const contacts=[...O.phones.filter(v=>!S.phones.includes(v)),...O.emails.filter(v=>!S.emails.includes(v)),...O.urls.filter(v=>!S.urls.includes(v))];
  if(contacts.length)findings.push({level:'risk',type:'invented-contact',title:'원문에 없는 연락처·링크',detail:uniq(contacts).slice(0,6).join(', ')+' — AI가 지어낸 정보일 수 있습니다. 지우거나 [확인 필요]로 바꾸세요.'});
  if(UNDECIDED.test(src)&&DECIDED_OUT.test(out))findings.push({level:'warn',type:'decided',title:'미확정 사항이 「확정」으로 바뀌었을 수 있음',detail:'원문에 보류·검토·협의 중인 내용이 있습니다. 결과의 「확정」 표현이 원문과 맞는지 확인하세요.'});
  if(MISSING_CUE.test(src)&&!MARKER.test(out))findings.push({level:'warn',type:'marker',title:'[확인 필요] 표시가 없음',detail:'원문에 정해지지 않은 정보(미정·검토 중 등)가 있는데 결과에 [확인 필요] 표시가 없습니다.'});
  const lost=[...S.dates.filter(v=>!O.dates.includes(v)).map(v=>v.replace('월','월 ')),...S.times.filter(v=>!O.times.includes(v)),...S.numbers.filter(v=>!inSource(v,O.numbers,out))];
  if(lost.length)findings.push({level:'info',type:'missing',title:'결과에 빠진 원문 정보',detail:uniq(lost).slice(0,12).join(', ')+' — 의도적으로 뺀 것이 아니라면 추가하세요.'});
  if(!findings.length)findings.push({level:'ok',type:'clean',title:'규칙 점검에서 문제를 찾지 못했습니다',detail:'그래도 사람·담당·결정 내용은 원문과 직접 대조하세요. 이 점검기는 숫자·연락처·표현 규칙만 봅니다.'});
  const count=lv=>findings.filter(f=>f.level===lv).length;
  return {findings,summary:{risk:count('risk'),warn:count('warn'),info:count('info')}};
}
