// Versioned voluntary daily self-inspection. Legal filings are separate workflows.
export const CHECKLIST_VERSION='2026-11-12.v1';
export const ITEMS=Object.freeze([
  {id:'area',section:'영업신고·변경',label:'실제 영업 범위가 영업신고 면적·도면과 일치합니까?',help:'옆 점포, 외부 테이블, 창고, 주차장, 가설 공간을 포함해 확인'},
  {id:'address',section:'영업신고·변경',label:'상호·소재지·영업자 등 신고사항에 미신고 변경이 없습니까?'},
  {id:'structure',section:'영업신고·변경',label:'증축·내부구조·용도 변경이나 새로운 시설 사용에 미확인 사항이 없습니까?',help:'공사 전 건축·소방·위생 담당기관 검토가 필요할 수 있음'},
  {id:'outdoor',section:'영업신고·변경',label:'옥외영업·도로·공용부분·주차장 사용 범위가 확인되어 있습니까?'},
  {id:'notice',section:'영업신고·변경',label:'행정기관의 시정요구, 점검 통지 또는 신고 보완사항에 미조치 건이 없습니까?'},
  {id:'ingredients',section:'위생·식품',label:'원재료의 소비기한·표시·보관상태를 점검했습니까?'},
  {id:'cold',section:'위생·식품',label:'냉장·냉동·가열 식품의 온도와 기록을 업종 기준에 따라 확인했습니까?',help:'업종별 수치 기준은 공식 매뉴얼과 시설 기준에 따라 별도로 설정'},
  {id:'cross',section:'위생·식품',label:'식재료·기구의 교차오염 방지와 세척·소독 상태가 양호합니까?'},
  {id:'hands',section:'위생·식품',label:'종사자 위생·손씻기·건강 이상 여부를 확인했습니까?',help:'민감한 건강정보는 이 점검표에 입력하지 마세요'},
  {id:'waste',section:'위생·식품',label:'음식물쓰레기, 해충·방충, 배수 및 청소 상태가 양호합니까?'},
  {id:'fire',section:'소방·시설안전',label:'소화기·화재감지 등 소방시설과 피난통로가 정상입니까?'},
  {id:'gas',section:'소방·시설안전',label:'가스 누출·차단밸브·배기시설 이상이 없습니까?'},
  {id:'electric',section:'소방·시설안전',label:'전기 배선·콘센트·열원 주변에 위험 징후가 없습니까?'},
  {id:'slip',section:'소방·시설안전',label:'미끄럼, 낙상, 적재물 붕괴 등 작업장 위험을 확인했습니까?'},
  {id:'training',section:'행정·증빙',label:'위생교육·안전점검·검사 등 기한이 지난 의무사항이 없습니까?'},
  {id:'proof',section:'행정·증빙',label:'변경신고 접수증·허가증·시설점검 증빙을 확인할 수 있습니까?'}
]);
export const STATUSES=Object.freeze([
  {value:'ok',label:'정상'},{value:'issue',label:'조치필요'},
  {value:'na',label:'해당없음'},{value:'',label:'미점검'}
]);
export const CHANGE_IDS=new Set(['area','address','structure','outdoor','notice']);
export function blankRecord(business,date){return {version:CHECKLIST_VERSION,business,date,checker:'',rows:Object.fromEntries(ITEMS.map(i=>[i.id,{status:'',note:''}])),complete:false,savedAt:null};}
export function sanitizeRecord(raw,business,date){
  const record=blankRecord(business,date);
  if(!raw||raw.business!==business||raw.date!==date||raw.version!==CHECKLIST_VERSION)return record;
  record.checker=String(raw.checker||'').slice(0,60);
  for(const i of ITEMS){const src=raw.rows?.[i.id]||{};record.rows[i.id]={status:['ok','issue','na'].includes(src.status)?src.status:'',note:String(src.note||'').slice(0,500)};}
  record.complete=Boolean(raw.complete);record.savedAt=typeof raw.savedAt==='string'?raw.savedAt:null;
  return record;
}
export function evaluate(record){
  const missing=ITEMS.filter(i=>!['ok','issue','na'].includes(record.rows?.[i.id]?.status));
  const issues=ITEMS.filter(i=>record.rows?.[i.id]?.status==='issue');
  const undocumented=issues.filter(i=>!String(record.rows[i.id].note||'').trim());
  return {total:ITEMS.length,checked:ITEMS.length-missing.length,missing,issues,undocumented,changeIssues:issues.filter(i=>CHANGE_IDS.has(i.id)),canComplete:missing.length===0&&undocumented.length===0};
}
export function csvSafe(value){
  let text=String(value??'');
  if(/^[\s]*[=+@-]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function csvForRecord(record){
  const lines=[['사업장','점검일','점검자','상태','항목','확인결과','조치·비고','저장시각']];
  for(const item of ITEMS)lines.push([record.business,record.date,record.checker,record.complete?'완료':'임시저장',item.label,STATUSES.find(s=>s.value===record.rows[item.id].status)?.label||'미점검',record.rows[item.id].note,record.savedAt||'']);
  return '\uFEFF'+lines.map(row=>row.map(csvSafe).join(',')).join('\r\n');
}
