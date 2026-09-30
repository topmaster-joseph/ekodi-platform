const TOPICS = Object.freeze([
  {id:'relationship',label:'관계',keywords:['관계','친구','사람','상처','갈등','미워','용서','연애','헤어','외로'],root:'나는 사랑받고 사랑할 수 있는 사람인가?',scriptures:['누가복음 10:25-37','요한복음 13:34-35'],next:'이 관계에서 내가 가장 바라는 변화는 무엇인가요?',action:'오늘 한 사람에게 판단보다 질문을 하나 건네 보세요.'},
  {id:'money',label:'돈',keywords:['돈','빚','매출','수입','월급','재정','장사','사업','생활비','전기세'],root:'무엇이 나를 안전하게 만든다고 믿고 있는가?',scriptures:['마태복음 6:25-34','누가복음 12:13-21'],next:'돈 자체보다 더 두려운 것은 무엇인가요?',action:'오늘 내가 통제할 수 있는 재정 행동 한 가지와 통제할 수 없는 걱정 한 가지를 나눠 적어 보세요.'},
  {id:'work',label:'일·진로',keywords:['일','직장','취업','진로','퇴사','창업','직업','소명','공부','시험'],root:'성과와 직함을 걷어내고도 내 삶에는 어떤 가치가 남는가?',scriptures:['창세기 2:15','골로새서 3:23-24'],next:'지금 하는 일에서 가장 살리고 싶은 가치는 무엇인가요?',action:'오늘의 일을 한 가지 고르고 누구를 살리는 일인지 이름 붙여 보세요.'},
  {id:'family',label:'가족',keywords:['가족','부모','엄마','아빠','자녀','아이','남편','아내','부부'],root:'가까움 속에서도 서로를 소유하지 않고 사랑할 수 있는가?',scriptures:['룻기 1:16-17','에베소서 4:31-32'],next:'가족에게 기대하는 것과 내가 줄 수 있는 것을 하나씩 말해 볼까요?',action:'가족 한 사람의 말을 해결하려 하지 말고 끝까지 들어 보세요.'},
  {id:'heart',label:'마음',keywords:['불안','걱정','우울','마음','두려','스트레스','지쳐','힘들','공허','허무'],root:'흔들리는 상황 속에서 나는 어디에 마음을 둘 수 있는가?',scriptures:['시편 42편','빌립보서 4:6-7'],next:'지금 마음을 가장 무겁게 만드는 한 문장을 그대로 적어 볼까요?',action:'오늘 해결해야 할 일과 오늘 내려놓아도 되는 일을 한 가지씩 구분해 보세요.'},
  {id:'future',label:'미래',keywords:['미래','앞으로','내일','계획','결정','선택','길','방향','노후'],root:'모든 것을 알지 못해도 다음 한 걸음을 선택할 수 있는가?',scriptures:['잠언 3:5-6','마태복음 6:34'],next:'정답보다 지금 분명히 알 수 있는 다음 한 걸음은 무엇인가요?',action:'48시간 안에 실행할 수 있는 가장 작은 행동 하나를 정해 보세요.'},
  {id:'faith',label:'신앙',keywords:['하나님','예수','교회','신앙','믿음','기도','성경','말씀','복음'],root:'나는 하나님에 대해 아는 것을 넘어 하나님을 신뢰하고 있는가?',scriptures:['마가복음 9:24','요한복음 20:24-29'],next:'믿고 싶은 마음과 믿기 어려운 마음 중 지금 더 큰 쪽은 어느 쪽인가요?',action:'오늘 한 구절을 읽고 동의되는 말과 걸리는 말을 각각 한 줄 적어 보세요.'},
  {id:'meaning',label:'삶',keywords:['인생','삶','의미','죽음','실패','상실','후회','왜','행복','가치'],root:'내 삶의 가치는 무엇으로 결정되는가?',scriptures:['전도서 3:1-13','요한복음 10:10'],next:'지금까지의 삶에서 잃고 싶지 않은 한 가지는 무엇인가요?',action:'오늘 감사할 것보다 살려내고 싶은 것 한 가지를 적어 보세요.'}
]);
const DAILY_QUESTIONS = Object.freeze([
  '요즘 가장 자주 떠오르는 걱정은 무엇인가요?',
  '잘 살고 있다는 것은 당신에게 어떤 모습인가요?',
  '돈이 조금 더 많아지면 지금의 불안은 얼마나 사라질까요?',
  '가장 가까운 사람에게 아직 하지 못한 말이 있나요?',
  '다시 시작할 수 있다면 무엇부터 바꾸고 싶나요?',
  '요즘 나를 가장 많이 움직이는 것은 사랑인가요, 두려움인가요?',
  '내가 통제하려 애쓰지만 사실 통제할 수 없는 것은 무엇인가요?',
  '성공하지 않아도 계속하고 싶은 일이 있나요?',
  '용서와 화해는 같은 것일까요?',
  '오늘 하루에서 반드시 지키고 싶은 한 가지는 무엇인가요?',
  '누군가 나를 있는 그대로 알아준다면 가장 먼저 무엇을 말하고 싶나요?',
  '내 삶에서 충분하다고 말하기 가장 어려운 영역은 어디인가요?'
]);

const URGENT_PATTERNS = ['죽고 싶','자살','극단적 선택','사라지고 싶','해치고 싶','목숨을','살기 싫'];

function clean(value,max=1200){return String(value??'').replace(/[<>]/g,'').trim().slice(0,max)}
function hash(text){let n=0;for(const ch of String(text)){n=((n<<5)-n)+ch.charCodeAt(0);n|=0}return Math.abs(n)}
function kstDate(value=new Date()){
  const d=new Date(value);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function urgent(message){const lower=String(message||'').toLowerCase();return URGENT_PATTERNS.some(pattern=>lower.includes(pattern))}

export function lifeTopics(){return TOPICS.map(({keywords,...topic})=>topic)}
export function todayLifeQuestion(value=new Date()){
  const date=kstDate(value);
  return Object.freeze({date,question:DAILY_QUESTIONS[hash(date)%DAILY_QUESTIONS.length]});
}
export function detectLifeTopic(message='',preferred=''){
  const explicit=TOPICS.find(topic=>topic.id===preferred);
  if(explicit)return explicit;
  const text=String(message||'').toLowerCase();
  let best=TOPICS[TOPICS.length-1],score=0;
  for(const topic of TOPICS){const current=topic.keywords.reduce((sum,keyword)=>sum+(text.includes(keyword)?1:0),0);if(current>score){best=topic;score=current}}
  return best;
}
export function buildLifeReflection({message='',topic='',now=new Date()}={}){
  const input=clean(message);
  const selected=detectLifeTopic(input,topic);
  const base={schemaVersion:1,date:kstDate(now),topic:{id:selected.id,label:selected.label},userText:input,
    rootQuestion:selected.root,scriptures:selected.scriptures,nextQuestion:selected.next,action:selected.action,
    principle:'삶의 질문에서 시작해 성경의 이야기를 발견하고, 오늘의 작은 실천과 사람의 관계로 이어갑니다.'};
  if(urgent(input))return Object.freeze({...base,urgent:true,scriptures:[],rootQuestion:'지금 혼자 감당하지 않고 안전한 사람과 연결되는 것이 먼저입니다.',nextQuestion:'지금 곁에 연락할 수 있는 사람이 있나요?',action:'즉시 가까운 사람이나 지역의 응급·위기지원 기관에 연락하고 혼자 있지 마세요.',notice:'AI 대화보다 즉각적인 사람의 도움이 우선입니다.'});
  const mirror=input?`“${clean(input,180)}”라는 말 안에는 ${selected.label}의 문제뿐 아니라 더 깊은 삶의 질문이 함께 들어 있을 수 있습니다.`:`${selected.label}의 문제를 정답부터 찾기보다, 그 안에 있는 더 깊은 질문부터 살펴봅니다.`;
  return Object.freeze({...base,urgent:false,mirror,bridge:'성경을 정답표처럼 붙이기보다, 비슷한 질문을 품은 이야기와 함께 바라봅니다.'});
}

export function buildLifeAiPrompt({message='',topic='',reflection=null}={}){
  const r=reflection||buildLifeReflection({message,topic});
  if(r.urgent)return clean(message,4000);
  return [
    '[EKODI 인생AI · 오늘의 질문 대화 원칙]',
    '사용자의 삶에서 시작하고 종교적 설득이나 압박을 하지 마세요.',
    '먼저 사용자의 말을 짧게 비추고, 한 번에 질문 하나만 하세요.',
    '성경은 정답을 던지는 도구가 아니라 삶을 함께 해석하는 이야기로 연결하세요.',
    '성경 본문을 길게 인용하지 말고 본문 위치와 맥락을 간단히 제시하세요.',
    '사용자의 선택권을 보존하고 교회 참여나 신앙 고백을 강요하지 마세요.',
    '상담·의료·법률·재정의 고위험 판단은 전문가를 대신하지 마세요.',
    `현재 주제: ${r.topic.label}`,
    `근원 질문 후보: ${r.rootQuestion}`,
    `연결 가능한 본문: ${r.scriptures.join(', ')}`,
    `사용자 이야기: ${clean(message,3200)}`,
    '응답 형식: 공감적 반영 1~2문장 → 더 깊은 질문 1개 → 필요할 때만 성경 이야기 연결 1개 → 오늘 가능한 작은 실천 1개.'
  ].join('\n');
}

export const LIFE_AI_CORE=Object.freeze({schemaVersion:1,topics:TOPICS.length,dailyQuestions:DAILY_QUESTIONS.length,providerIndependent:true,aiOptional:true,communityFirst:true});
