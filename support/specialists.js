const FIELD_TYPES=new Set(['text','select']);
const PROMOTED_MATCH_KEYS=new Set(['industry','businessType','employeeBand']);
const select=(key,label,options,hint='')=>({key,label,type:'select',options,hint});
const text=(key,label,placeholder,hint='')=>({key,label,type:'text',placeholder,hint});

export const SPECIALIST_WORKSPACES=Object.freeze({
  grant:Object.freeze({
    id:'grant',
    purpose:'사업·성장 지원금의 자격과 활용목적을 빠르게 좁힙니다.',
    examples:['매장 냉난방기 교체 지원','소상공인 AI·마케팅 지원','창업 사업화 자금'],
    sourceNote:'기업마당과 창업지원 공식 공고를 우선 확인하고, 지역·업종·사업단계 조건을 함께 봅니다.',
    fields:Object.freeze([
      select('businessStage','사업 단계',['예비·창업 준비','창업 3년 이내','창업 3~7년','7년 초과·계속사업','기관·단체']),
      text('industry','업종·분야','예: 외식업, 교육, 콘텐츠, AI'),
      select('supportArea','필요 분야',['사업화','마케팅·판로','시설·장비','디지털·AI','기술개발','인력·교육','컨설팅·경영','기타']),
      select('employeeBand','인력 규모',['1인','2~4명','5~9명','10~49명','50명 이상','해당 없음']),
    ]),
  }),
  subsidy:Object.freeze({
    id:'subsidy',
    purpose:'비용부담·바우처·환급·감면형 지원을 생활·사업 조건에 맞춰 찾습니다.',
    examples:['전기요금 부담을 줄이고 싶어요','냉난방기 교체 보조','지역 바우처·환급 지원'],
    sourceNote:'정부·지자체의 공식 안내를 우선하며, 금액과 수혜조건은 신청 시점 공고를 다시 확인합니다.',
    fields:Object.freeze([
      select('supportArea','지원 분야',['에너지·공공요금','주거·임차','돌봄·가족','교육·훈련','고용·인건비','시설·장비','교통·이동','기타']),
      select('applicantContext','신청 맥락',['개인·가정','소상공인·사업자','기관·단체','비영리·교회']),
      text('costBurden','현재 부담','예: 전기료, 임차료, 장비교체 비용'),
    ]),
  }),
  scholarship:Object.freeze({
    id:'scholarship',
    purpose:'학업단계·전공·지역·장학목적을 기준으로 장학 기회를 좁힙니다.',
    examples:['대학원 등록금 장학금','지역인재 장학금','연구·논문 장려금'],
    sourceNote:'학교·한국장학재단·공공기관·재단의 공식 공고를 우선하며, 성적·소득 증빙은 공고가 요구할 때만 준비합니다.',
    fields:Object.freeze([
      select('studyLevel','학업 단계',['고등학교','전문대·대학교','대학원 석사','대학원 박사','연구자·졸업생','기타']),
      text('majorArea','전공·연구 분야','예: 경영학, 교육학, AI'),
      select('scholarshipPurpose','장학 목적',['등록금','생활비','연구·논문','해외연수·유학','자격·교육','기타']),
      select('incomeBand','소득 조건',['모름·확인 필요','저소득·기초생활','중위소득 기준 확인 필요','소득 무관 선발 희망']),
    ]),
  }),
  contest:Object.freeze({
    id:'contest',
    purpose:'조직 목적과 수행역량에 맞는 공모·프로젝트 재원을 찾습니다.',
    examples:['지역상권 활성화 공모','교회 청년 프로젝트','지역사회 콘텐츠 공모'],
    sourceNote:'주관기관의 공모문·평가기준·제출양식을 원본 그대로 기준 삼고 수행의무를 함께 확인합니다.',
    fields:Object.freeze([
      select('organizationType','조직 유형',['기관·단체','비영리·사회적조직','교회·종교단체','기업·소상공인','개인팀']),
      text('projectArea','프로젝트 분야','예: 지역상권, 청년, 문화, 교육'),
      select('teamSize','수행 인력',['1인','2~4명','5~9명','10명 이상']),
      select('trackRecord','유사 수행경험',['없음','1회','2~3회','4회 이상']),
    ]),
  }),
  welfare:Object.freeze({
    id:'welfare',
    purpose:'생애주기와 생활상황을 기준으로 복지·생활 지원을 찾습니다.',
    examples:['청년 주거지원','돌봄·생활비 지원','의료비·긴급복지'],
    sourceNote:'복지 급여는 개인별 조건 차이가 커서 공식 복지서비스 안내와 관할기관 확인을 우선합니다.',
    fields:Object.freeze([
      select('lifeStage','생애 단계',['아동·청소년','청년','중장년','시니어','가족·가구']),
      select('supportArea','필요 분야',['생활비·긴급','주거','의료·건강','돌봄','교육','일자리·자립','기타']),
      select('householdContext','가구 상황',['1인가구','부부·가족','한부모·돌봄가구','다문화·이주가구','상세 확인 필요']),
      select('urgency','필요 시급성',['일반 탐색','1개월 안에 필요','1주 안에 확인 필요']),
    ]),
  }),
  private:Object.freeze({
    id:'private',
    purpose:'재단·기업 사회공헌·민간단체 지원을 공공기회와 함께 비교합니다.',
    examples:['민간재단 교육지원','지역사회 사회공헌 사업','취약계층 프로젝트 지원'],
    sourceNote:'민간지원은 통합 원천이 부족하므로 출처·운영주체·공식 모집페이지를 검증한 항목만 노출합니다.',
    fields:Object.freeze([
      select('applicantType','신청 주체',['개인','학생·청년','기관·단체','비영리·교회','지역사회 프로젝트']),
      text('causeArea','지원 목적','예: 교육, 돌봄, 지역사회, 창업'),
      text('beneficiary','주요 수혜대상','예: 청년 20명, 소상공인, 취약가정'),
      select('supportForm','희망 지원형태',['현금·사업비','물품·장비','교육·멘토링','공간·서비스','혼합']),
    ]),
  }),
  sponsorship:Object.freeze({
    id:'sponsorship',
    purpose:'후원하고 싶은 자원과 실제 필요를 목적·지역·방식에 따라 연결합니다.',
    examples:['청년 장학 후원','지역 프로젝트 물품 후원','소상공인 장비 후원 연결'],
    sourceNote:'후원은 이해상충·목적 외 사용·개인정보 노출 위험을 별도로 점검하며, 송금·계약은 자동 실행하지 않습니다.',
    fields:Object.freeze([
      select('relationRole','현재 역할',['후원이 필요함','후원하고 싶음','중개·운영기관']),
      text('causeArea','후원 목적','예: 장학, 돌봄, 지역프로젝트'),
      select('supportForm','자원 형태',['현금·사업비','물품·장비','전문서비스','공간','자원봉사·멘토링']),
      select('visibility','공개 범위 선호',['비공개 연결','조건 충족 대상에게만 공개','공개 프로젝트 가능']),
    ]),
  }),
});

export function getSpecialistWorkspace(id='grant'){
  return SPECIALIST_WORKSPACES[id]||SPECIALIST_WORKSPACES.grant;
}

export function validateSpecialistWorkspace(workspace){
  if(!workspace?.id||!Array.isArray(workspace.fields))return false;
  return workspace.fields.every(field=>field?.key&&field?.label&&FIELD_TYPES.has(field.type)&&(!field.options||Array.isArray(field.options)));
}

export function buildSpecialistProfile(common={},specific={},serviceId='grant'){
  const workspace=getSpecialistWorkspace(serviceId);
  const attributes={};
  const promoted={};
  for(const field of workspace.fields){
    const value=String(specific[field.key]??'').trim();
    if(!value)continue;
    attributes[field.key]=value;
    if(PROMOTED_MATCH_KEYS.has(field.key))promoted[field.key]=value;
  }
  const attributeKeywords=Object.values(attributes).filter(Boolean);
  const keywords=[common.need,...(common.interests||[]),common.region,...attributeKeywords].filter(Boolean);
  return {...common,...promoted,serviceId:workspace.id,attributes,keywords:[...new Set(keywords)]};
}

export function profileCompleteness(common={},specific={},serviceId='grant'){
  const workspace=getSpecialistWorkspace(serviceId);
  const values=[common.profileType,common.region,common.need,...workspace.fields.map(field=>specific[field.key])];
  const filled=values.filter(value=>String(value??'').trim()).length;
  return Math.round((filled/values.length)*100);
}

export function explainOpportunity(profile={},opportunity={}){
  const reasons=[];
  if(opportunity.official)reasons.push('공식 출처');
  if(profile.region&&String(opportunity.region||opportunity.title||'').includes(profile.region))reasons.push(`지역 ${profile.region} 관련`);
  const text=[opportunity.title,opportunity.summary,opportunity.target,opportunity.category,...(opportunity.tags||[])].join(' ').toLowerCase();
  const hits=(profile.keywords||[]).filter(value=>value&&text.includes(String(value).toLowerCase())).slice(0,3);
  if(hits.length)reasons.push(`관심조건 ${hits.join(' · ')} 일치`);
  if(opportunity.urgency?.daysLeft!=null&&opportunity.urgency.daysLeft>=0&&opportunity.urgency.daysLeft<=7)reasons.push('마감 7일 이내');
  if(!reasons.length)reasons.push('세부 자격조건 확인 필요');
  return reasons;
}
