const HUMAN_PATTERNS=[/관리자|담당자|사람(?:이|과|에게)?\s*(?:답|연결|상담)|직접\s*(?:답|상담|통화)/i,/human|agent|operator|representative/i];
const HIGH_RISK_PATTERNS=[/결제|환불|계약|해지|개인정보|비밀번호|계정\s*(?:삭제|탈취)|회원\s*삭제|법적|분쟁|신고|보안/i,/payment|refund|contract|privacy|password|delete\s+account|legal|security/i];
const FAILURE_PATTERNS=[/오류|장애|실패|안\s*돼|안\s*되|접속\s*(?:불가|안)|로그인\s*(?:불가|안)|발행\s*실패/i,/error|failed|failure|down|unavailable|can't\s+login/i];
const clean=(value,max=8000)=>String(value??'').trim().slice(0,max);

export function classifyMessengerMessage(value=''){
  const text=clean(value);let score=0;const reasons=[];
  if(HUMAN_PATTERNS.some(pattern=>pattern.test(text))){score+=4;reasons.push('explicit_human_request')}
  if(HIGH_RISK_PATTERNS.some(pattern=>pattern.test(text))){score+=3;reasons.push('sensitive_or_high_risk')}
  if(FAILURE_PATTERNS.some(pattern=>pattern.test(text))){score+=2;reasons.push('service_failure')}
  return Object.freeze({score,priority:score>=5?'urgent':score>=2?'review':'normal',requiresHuman:score>=3,reasons:Object.freeze(reasons)});
}

export function freeAssistReply(triage={}){
  return triage.requiresHuman
    ?'요청을 확인했습니다. 중요한 내용으로 분류해 관리자 확인 대기열에 올렸습니다. 담당자가 참여하기 전까지 대화 맥락은 그대로 보존됩니다.'
    :'요청을 접수했습니다. 현재 고급 AI 응답 연결이 없거나 일시적으로 사용할 수 없어 기본 지원 모드로 기록했습니다. 사람의 확인이 필요하면 바로 연결을 요청할 수 있습니다.';
}
