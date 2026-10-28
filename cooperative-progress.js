// Private cooperative formation workflow. Templates are guidance, never legal filing truth.
export const COOP_LAUNCH_STAGES = ['가입·운영원칙', '설립서류', '창립총회', '신고·출자·등기', '사업개시', '운영·디지털'];
export const COOP_LAUNCH_TASKS = [
  {
    "key": "01",
    "phase": 1,
    "required": true,
    "title": "실제 발기인 5인 이상 확정",
    "guide": "실명·가입주체(개인/법인)와 참여 의사 확인. 임시 표기는 확정 명부로 교체."
  },
  {
    "key": "02",
    "phase": 1,
    "required": true,
    "title": "정관상 조합원 자격 확인",
    "guide": "개인/법인, 사업자 자격 등 가입조건과 실제 구성원이 맞는지 검토한 기록."
  },
  {
    "key": "03",
    "phase": 1,
    "required": true,
    "title": "첫 공동사업 한 가지 선정",
    "guide": "품목·고객·공급자·조합이 맡는 역할을 한 장으로 결정. 법적 사업 개시는 별도 단계."
  },
  {
    "key": "04",
    "phase": 1,
    "required": true,
    "title": "주사무소 주소·사용권 확정",
    "guide": "정확한 주소와 임대차·사용승낙 등 필요한 근거 확보. 관할 접수처 확인에 사용."
  },
  {
    "key": "05",
    "phase": 1,
    "required": true,
    "title": "출자·설립비·역할 합의",
    "guide": "1좌 금액과 인별 약정, 설립비 분담, 실무 담당자 합의. 1인 출자는 전체의30% 초과 금지."
  },
  {
    "key": "06",
    "phase": 1,
    "required": true,
    "title": "임원 후보·겸직 제한 검토",
    "guide": "이사장·이사·감사 후보와 법정 인원·자격·겸직 제한을 접수처와 확인. 총회에서 선출."
  },
  {
    "key": "07",
    "phase": 2,
    "required": true,
    "title": "정관 초안 검토·확정안 작성",
    "guide": "명칭·목적·가입자격·출자·임원·공고방법·회계·사업범위를 구성원과 검토. 최종 의결은 총회."
  },
  {
    "key": "08",
    "phase": 2,
    "required": true,
    "title": "설립동의·개인정보 처리 확인",
    "guide": "발기인·설립동의자의 의사와 필요한 서명 확보. 주민번호·인감·신분증은 이 표에 첨부하지 않음."
  },
  {
    "key": "09",
    "phase": 2,
    "required": true,
    "title": "사업계획서 작성",
    "guide": "첫 사업의 판매/공급 방식, 교육·협력 활동, 실행 담당과 수익·비용 구조 작성."
  },
  {
    "key": "10",
    "phase": 2,
    "required": true,
    "title": "첫 회계연도 예산 작성",
    "guide": "설립비와 운영비·사업비, 자금 조달과 출자금 구분. 근거 없는 보조금 수입은 확정 수입으로 넣지 않음."
  },
  {
    "key": "11",
    "phase": 2,
    "required": true,
    "title": "인별 출자좌수 명세 작성",
    "guide": "1좌 금액·각 조합원 약정 좌수·총좌수 정리. 약정과 실제 납입은 구분."
  },
  {
    "key": "12",
    "phase": 2,
    "required": true,
    "title": "임원·발기인 명부 준비",
    "guide": "접수처 최신 서식에 따라 작성. 임원 후보 자료와 총회 후 선출 결과의 일치 확인."
  },
  {
    "key": "13",
    "phase": 2,
    "required": true,
    "title": "관할 접수처 사전 검토",
    "guide": "주소 기준 접수기관·최신 서식·명칭·사업범위·보완 가능 사항 확인 기록."
  },
  {
    "key": "14",
    "phase": 3,
    "required": true,
    "title": "창립총회 개최 공고",
    "guide": "일시·장소·가입자격·의결사항 공고. 공고 증빙과 공고일 보관. 사이에 최소7일 확보."
  },
  {
    "key": "15",
    "phase": 3,
    "required": true,
    "title": "창립총회 개최·안건 의결",
    "guide": "정관·사업계획·예산·임원선출·설립경비 의결. 설립동의자 과반수 출석, 출석자2/3 이상 찬성 확인."
  },
  {
    "key": "16",
    "phase": 3,
    "required": true,
    "title": "의사록·선출 결과 정리",
    "guide": "의사 진행·결과·출석 및 의결 기록, 필요한 서명/날인, 임원 취임 관련 자료 확보."
  },
  {
    "key": "17",
    "phase": 4,
    "required": true,
    "title": "설립신고 접수",
    "guide": "확정 정관·공고·의사록·명부·사업계획·예산·출자명세 등 최신 제출목록 대조 후 접수증 보관."
  },
  {
    "key": "18",
    "phase": 4,
    "required": false,
    "title": "신고 보완 요구 처리",
    "guide": "보완 요청이 있으면 내용·담당·제출일 기록. 요구가 없으면 해당없음 선택 후 메모에 근거 기재."
  },
  {
    "key": "19",
    "phase": 4,
    "required": true,
    "title": "신고확인증 수령",
    "guide": "신고 접수와 수리는 구분. 발급된 신고확인증의 조합명·주소·대표 사항 확인."
  },
  {
    "key": "20",
    "phase": 4,
    "required": true,
    "title": "설립사무 인수인계",
    "guide": "신고확인증 발급 후 발기인에서 선출된 이사장에게 사무 인계. 인수인계서 보관."
  },
  {
    "key": "21",
    "phase": 4,
    "required": true,
    "title": "출자금 납입 완료 확인",
    "guide": "인별 실제 입금과 약정좌수를 대조하고 전체 납입완료일을 이 행의 완료일에 입력. 등기기한 계산 기준."
  },
  {
    "key": "22",
    "phase": 4,
    "required": true,
    "title": "설립등기 제출자료 점검",
    "guide": "등기소/전문가와 정관·의사록 공증 필요 여부·취임/인감·주소 등 요구자료를 확인한 기록."
  },
  {
    "key": "23",
    "phase": 4,
    "required": true,
    "title": "설립등기 신청",
    "guide": "출자금 납입이 끝난 날부터14일 이내 신청. 접수증 보관. 목표일과 상단 법정기한 함께 확인."
  },
  {
    "key": "24",
    "phase": 4,
    "required": true,
    "title": "등기 완료·법인사항 확인",
    "guide": "발급된 등기사항증명서로 명칭·사무소·임원·출자 등 확인. 법인 성립 여부를 이 단계에서 확인."
  },
  {
    "key": "25",
    "phase": 5,
    "required": true,
    "title": "사업자등록·세무 일정 설정",
    "guide": "세무서 요구자료와 업태·종목, 과세유형 및 신고 일정을 확인하고 사업자등록증 보관."
  },
  {
    "key": "26",
    "phase": 5,
    "required": true,
    "title": "조합별 계좌·회계 분리",
    "guide": "각 조합 명의 계좌, 장부·증빙 보관체계, 지출 승인과 월별 보고 담당 확정. 개인 자금과 구분."
  },
  {
    "key": "27",
    "phase": 5,
    "required": false,
    "title": "사업별 신고·허가 확인",
    "guide": "온라인판매·식품/수산물 가공·보관 등 실제 사업 기준으로 신고/허가 필요 여부 확인. 불필요하면 근거 기록."
  },
  {
    "key": "28",
    "phase": 5,
    "required": true,
    "title": "첫 거래 조건 확정",
    "guide": "공급자·구매자·가격·원가·배송·품질·반품·정산 책임을 확인한 계약/합의서. 두 조합 간 거래도 기록."
  },
  {
    "key": "29",
    "phase": 5,
    "required": true,
    "title": "첫 소규모 거래·정산 검토",
    "guide": "필요 등록/허가 확인 후 한 품목 또는 한 거래부터 실행. 매출·비용·미수금·반품을 대조한 보고."
  },
  {
    "key": "30",
    "phase": 6,
    "required": false,
    "title": "관리자 실제 Google 로그인",
    "guide": "각 관리자가 자신의 지정 계정으로 로그인. 실제 계정 접근 확인 기록. 관리자 지정은 법적 임원 선출과 별도."
  },
  {
    "key": "31",
    "phase": 6,
    "required": false,
    "title": "홈페이지 저장·재조회 확인",
    "guide": "실제 로그인 상태에서 공개되지 않는 시험 기록을 저장·재조회하고 검증 기록 확보. 개인정보 입력 최소화."
  },
  {
    "key": "32",
    "phase": 6,
    "required": true,
    "title": "조합원 정보·권한 관리 확정",
    "guide": "명부 접근 담당, 수집 목적·필요정보·보관/삭제·정정 절차와 조합 간 권한 분리를 확인."
  },
  {
    "key": "33",
    "phase": 6,
    "required": true,
    "title": "주간 점검·월간 보고 시작",
    "guide": "매주 미완료/보류/기한 항목을 검토하고 회의록 기록. 월간 자금·거래·출자·조합원 변동 보고 일정 설정."
  }
];

const reject = code => { throw Object.assign(new Error(code), {code, status:400}); };
const clean = (v, max) => {
  if (v !== undefined && v !== null && typeof v !== 'string') reject('COOP_PROGRESS_INVALID');
  return String(v ?? '').trim().slice(0, max);
};
const validDate = value => {
  if (typeof value === 'string' && value.trim().length>10) reject('COOP_INVALID_DATE');
  const v=clean(value,10);
  if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v+'T00:00:00Z')) || new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)) reject('COOP_INVALID_DATE');
  return v;
};
export function initialCooperativeProgress(coop) {
  return {version:1,items:COOP_LAUNCH_TASKS.map(t=>({id:`${coop.workspaceId}:launch:${t.key}`,owner:'',status:'확인필요',targetDate:'',completedDate:'',evidence:'',nextAction:'',note:'',verified:false}))};
}
export function readCooperativeProgress(value,coop) {
  const result=initialCooperativeProgress(coop);
  if (!value) return result;
  // Fill missing template entries without replacing already stored user fields or writing on GET.
  if (value.version!==1 || !Array.isArray(value.items)) reject('COOP_PROGRESS_VERSION');
  for (const row of result.items) {const old=value.items.find(i=>i.id===row.id);if(old)Object.assign(row,old);}
  return result;
}
export function normalizeCooperativeProgress(input,coop,previous) {
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['version','items'].includes(k)) || input.version!==1 || !Array.isArray(input.items) || !input.items.length || input.items.length>COOP_LAUNCH_TASKS.length) reject('COOP_PROGRESS_INVALID');
  const result=readCooperativeProgress(previous,coop),seen=new Set();
  for (const raw of input.items) {
    if (!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(k=>!['id','owner','status','targetDate','completedDate','evidence','nextAction','note','verified'].includes(k))) reject('COOP_PROGRESS_INVALID');
    const row=result.items.find(i=>i.id===raw.id);
    if (!row || seen.has(raw.id)) reject('COOP_PROGRESS_ID'); seen.add(raw.id);
    const template=COOP_LAUNCH_TASKS.find(t=>row.id.endsWith(':launch:'+t.key));
    const old={...row};
    for (const [key,max] of [['owner',100],['evidence',800],['nextAction',1000],['note',2000]]) if (key in raw) row[key]=clean(raw[key],max);
    for (const key of ['targetDate','completedDate']) if (key in raw) row[key]=validDate(raw[key]);
    if ('status' in raw) {if(!['확인필요','대기','진행중','검토중','완료','보류','해당없음'].includes(raw.status))reject('COOP_PROGRESS_STATUS');row.status=raw.status;}
    if ('verified' in raw) {if(typeof raw.verified!=='boolean')reject('COOP_PROGRESS_INVALID');row.verified=raw.verified;}
    if (row.status==='해당없음' && (template.required || !row.note)) reject('COOP_PROGRESS_EXCLUSION');
    if (row.status!=='완료' || !row.completedDate || !row.evidence) row.verified=false;
    // Replacing previously reviewed evidence always clears its review; review again after saving.
    if (old.verified && (old.evidence!==row.evidence || old.completedDate!==row.completedDate)) row.verified=false;
  }
  return result;
}

// Self-contained so the exact calculation can be serialized into the existing browser client.
export function cooperativeProgressSummary(progress,definitions,today) {
  const rows=definitions.map(t=>{
    const row=progress.items.find(i=>i.id.endsWith(':launch:'+t.key));
    const excluded=!t.required && row.status==='해당없음' && !!row.note;
    const done=row.status==='완료' && !!row.completedDate && !!row.evidence && row.verified===true;
    return {...row,key:t.key,phase:t.phase,required:t.required,excluded,done,
      effectiveStatus:excluded?'해당없음':row.status==='완료'&&!done?'증빙확인필요':row.status};
  });
  const addDays=(value,days)=>{if(!value)return '';const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  const capital=rows.find(r=>r.key==='21'),notice=rows.find(r=>r.key==='14');
  const registrationDeadline=capital?.done?addDays(capital.completedDate,14):'';
  for(const row of rows){
    const limit=row.key==='23'&&registrationDeadline?(row.targetDate&&row.targetDate<registrationDeadline?row.targetDate:registrationDeadline):row.targetDate;
    row.overdue=!row.done&&!row.excluded&&!!limit&&limit<today;
  }
  const total=rows.filter(r=>!r.excluded).length,completed=rows.filter(r=>r.done).length;
  return {rows,total,completed,percent:total?Math.round(completed/total*100):0,overdue:rows.filter(r=>r.overdue).length,
    unplanned:rows.filter(r=>!r.done&&!r.excluded&&!r.targetDate).length,
    registrationDeadline,earliestMeeting:notice?.done?addDays(notice.completedDate,8):'',
    phases:[1,2,3,4,5,6].map(phase=>({phase,total:rows.filter(r=>r.phase===phase&&!r.excluded).length,completed:rows.filter(r=>r.phase===phase&&r.done).length,
      ready:phase===6||rows.filter(r=>r.phase<phase&&r.required).every(r=>r.done),parallel:phase===6}))};
}
