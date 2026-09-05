export const EXPERIENCE_META = Object.freeze({
  serviceId: 'experience',
  publicName: '에코디 체험',
  publicNameEn: 'EKODI Experience',
  canonicalOrigin: 'https://exp.ekodi.kr',
  tagline: '에코디를 직접 경험해 보세요.',
  statusSource: 'curated-public-projection',
  dataPolicy: 'synthetic-only',
  sideEffects: 'none',
});

const PERSONAS = Object.freeze([
  { id:'personal', label:'개인', sample:'나의 에코디', prompt:'내 일상과 관계에서 필요한 서비스를 찾아봅니다.' },
  { id:'church', label:'교회', sample:'한빛교회', prompt:'예배, 말씀, 공동체와 운영의 흐름을 체험합니다.' },
  { id:'small-business', label:'소상공인', sample:'봄날카페', prompt:'홍보, 판매, 고객관계와 운영의 흐름을 체험합니다.' },
  { id:'business', label:'기업', sample:'온누리컴퍼니', prompt:'경영, 협업, 마케팅과 투자 연결을 체험합니다.' },
  { id:'organization', label:'단체', sample:'마을연결협회', prompt:'회원, 소통, 프로젝트와 공통서비스 연결을 체험합니다.' },
  { id:'project', label:'프로젝트', sample:'동네살림 프로젝트', prompt:'목표, 협업, 콘텐츠와 실행 흐름을 체험합니다.' },
]);

const SERVICES = Object.freeze([
  { id:'my', name:'My EKODI', group:'개인·공간', status:'live', statusLabel:'운영 중', experience:'simulation', publicUrl:'https://my.ekodi.kr/', summary:'나의 공간과 활동을 한곳에서 연결합니다.', personas:['personal','church','small-business','business','organization','project'], flow:['사용자 공간','필요한 서비스 선택','활동과 연결','결과 확인'] },
  { id:'church', name:'에코디교회', group:'공동체', status:'live', statusLabel:'운영 중', experience:'simulation', publicUrl:'https://church.ekodi.kr/', summary:'예배, 말씀, 공동체의 경험을 연결합니다.', personas:['church','organization','personal'], flow:['교회 공간','말씀·모임','공동체 연결','지속적 돌봄'] },
  { id:'marketing', name:'Marketing AI', group:'사업', status:'live', statusLabel:'운영 중', experience:'simulation', publicUrl:'https://marketing.ekodi.kr/', summary:'상황에 맞는 홍보 콘텐츠와 채널 실행을 돕습니다.', personas:['small-business','business','church','organization','project'], flow:['공간의 필요','마케팅 기능 연결','콘텐츠 제안','채널 결과'] },
  { id:'mall', name:'에코디몰', group:'사업', status:'live', statusLabel:'운영 중', experience:'simulation', publicUrl:'https://ekodi.kr/mall', summary:'관계와 상황에 맞는 상품 발견과 추천을 돕습니다.', personas:['personal','small-business','business','organization'], flow:['필요 발견','관계형 추천','상품 비교','외부 구매 연결'] },
  { id:'business', name:'Business OS', group:'사업', status:'beta', statusLabel:'베타', experience:'simulation', publicUrl:'https://business.ekodi.kr/', summary:'사업 운영의 여러 기능을 하나의 흐름으로 엮습니다.', personas:['small-business','business','organization'], flow:['사업 공간','운영 기능 선택','AI 보조','실행 판단'] },
  { id:'invest', name:'EKODI Investment', group:'사업', status:'beta', statusLabel:'베타', experience:'simulation', publicUrl:'https://invest.ekodi.kr/', summary:'사업과 프로젝트의 투자 검토와 연결을 지원합니다.', personas:['business','organization','project'], flow:['프로젝트','자료 정리','검토·분석','연결 준비'] },
  { id:'journal', name:'EKODI Journal', group:'지식', status:'live', statusLabel:'운영 중', experience:'real-link', publicUrl:'https://journal.ekodi.kr/', summary:'에코디의 가치와 실천을 공개 기록으로 남깁니다.', personas:['personal','church','small-business','business','organization','project'], flow:['경험과 원칙','기록','검토','공개 배포'] },
  { id:'work', name:'EKODI Work', group:'일·프로젝트', status:'live', statusLabel:'운영 중', experience:'simulation', publicUrl:'https://work.ekodi.kr/', summary:'일과 프로젝트의 실행 흐름을 연결합니다.', personas:['personal','business','organization','project'], flow:['목표','역할과 작업','협업','완료'] },
  { id:'messenger', name:'EKODI Messenger', group:'소통', status:'beta', statusLabel:'베타', experience:'simulation', publicUrl:'https://messenger.ekodi.kr/', summary:'사람, AI, 공간과 다음 행동을 대화로 연결합니다.', personas:['personal','church','small-business','business','organization','project'], flow:['대화','맥락 이해','서비스 연결','다음 행동'] },
  { id:'shop', name:'Shop Platform', group:'사업', status:'planned', statusLabel:'계획', experience:'preview', publicUrl:null, summary:'각 공간이 독립적인 상점을 운영하도록 설계 중입니다.', personas:['small-business','business','church','organization'], flow:['상점 구상','상품 구성','운영 흐름','향후 연결'] },
  { id:'education', name:'EKODI Education', group:'지식', status:'planned', statusLabel:'계획', experience:'preview', publicUrl:'https://edu.ekodi.kr/', summary:'배움과 훈련의 여정을 연결하는 서비스를 준비합니다.', personas:['personal','church','organization'], flow:['배움의 목적','과정 탐색','학습 계획','성장 기록'] },
  { id:'money', name:'EKODI Money', group:'생활·재정', status:'preparing', statusLabel:'준비 중', experience:'simulation', publicUrl:'https://money.ekodi.kr/', summary:'계좌와 자동이체 등 금융관계를 안전하게 정리하도록 돕습니다.', personas:['personal','small-business','organization'], flow:['현황 정리','관계 확인','선택지 제안','공식 채널 인계'] },
]);

export function getExperienceCatalog(){
  return {
    meta: EXPERIENCE_META,
    modes:[
      {id:'user',label:'사용자모드',description:'무엇을 할 수 있는지 직접 체험합니다.'},
      {id:'developer',label:'개발자모드',description:'구현정보 없이 서비스의 역할과 연결관계만 봅니다.'},
    ],
    personas: PERSONAS,
    services: SERVICES,
    safety:{
      syntheticDataOnly:true,
      productionWrites:false,
      payments:false,
      publishing:false,
      messages:false,
      sourceCodeVisible:false,
      internalTopologyVisible:false,
    },
  };
}
