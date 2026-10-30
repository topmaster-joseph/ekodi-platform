// Free-first, author-controlled inspiration and writing mentorship.
// No provider call, billing, publication, catalog mutation or server storage.
export const MENTOR_FIELDS = Object.freeze([
  ['literature','문학·소설','인물의 선택과 갈등, 장면의 인과관계'],
  ['poetry','시·창작','이미지와 운율, 비유의 독창성'],
  ['memoir','에세이·자서전','실제 경험과 성찰, 사생활 보호'],
  ['theology','신학·종교','본문 맥락과 해석, 전통과 반론, 출처'],
  ['humanities','철학·인문','개념 정의와 논증, 다양한 해석'],
  ['history','역사·문화','시대적 맥락과 사료, 출처와 연대'],
  ['community','사회·지역','다양한 당사자의 목소리와 실제 현장'],
  ['business','경영·창업','독자의 실제 문제, 시장 근거와 적용 사례'],
  ['economics','경제·정책','통계의 기준·시점과 정책의 다양한 영향'],
  ['science','과학·기술·AI','재현 가능한 자료, 한계와 불확실성'],
  ['education','교육·교재','학습자의 수준, 학습목표와 확인 질문'],
  ['children','아동·청소년','연령별 이해도와 표현, 안전성·접근성'],
  ['arts','예술·디자인','작품의 관점, 표현 선택과 이용 권리'],
  ['wellness','건강·생활','검증 가능한 건강정보, 전문가 검토 필요성'],
  ['practical','실용·취미','따라 할 수 있는 순서, 재료와 유의사항'],
  ['research','연구·학술','연구질문, 방법, 인용과 반증 가능성'],
  ['other','기타·융합','분야를 연결하는 독창적인 질문과 독자 가치'],
]);
export const MENTOR_STAGES = Object.freeze([
  ['inspiration','영감 발굴','지금 가장 오래 마음에 남은 질문이나 장면은 무엇인가요?','왜 그 질문이 저자에게 중요한지 한 문장으로 적어 보세요.'],
  ['readers','독자와 목적','누구에게 어떤 변화를 남기고 싶은가요?','독자의 상황과 이해 수준, 읽기를 마친 뒤 남길 핵심 질문을 떠올리세요.'],
  ['perspective','고유한 관점','다른 책과 구별되는 나만의 경험과 관점은 무엇인가요?','실제 경험과 추측, 상상 속 장면을 분명하게 구분하세요.'],
  ['outline','구성 설계','독자가 처음부터 끝까지 따라갈 질문의 순서는 무엇인가요?','시작·전개·전환·마무리를 소제목과 핵심 문장으로 배열하세요.'],
  ['draft','장면·근거 집필','첫 장을 구체적으로 보여 주는 장면, 자료 또는 주장은 무엇인가요?','가능하면 단정 대신 원자료, 대화, 관찰을 사용해 직접 작성하세요.'],
  ['critique','반론·비평','이 주장이나 장면의 가장 약한 부분은 어디인가요?','반론, 비약, 반복, 편견, 출처 없는 인용을 따로 표시하세요.'],
  ['revision','재작성·편집','저자의 목소리를 가장 선명하게 드러내려면 무엇을 고쳐야 할까요?','살릴 문장과 덜어낼 문장을 나누어 수정하세요.'],
  ['finish','저자 최종 점검','마지막 문장에 어떤 울림과 질문을 남기고 싶나요?','인용·권리·사실·독자 접근성을 확인하세요. 이 점검은 출판 승인이 아닙니다.'],
]);
const lookup=(items,key)=>items.find(row=>row[0]===key);
export function resolveMentorField(value) {
  const source=String(value??'').trim().slice(0,120);
  if(lookup(MENTOR_FIELDS,source))return source;
  if(!source)return 'other';
  const match=MENTOR_FIELDS.find(([id,label])=>id!=='other'&&(label.includes(source)||source.includes(label.split('·')[0])));
  return match?.[0]||'other';
}
export function writingMentorStep({field='other',stage='inspiration'}={}) {
  const row=lookup(MENTOR_STAGES,stage)||MENTOR_STAGES[0];
  const subject=lookup(MENTOR_FIELDS,resolveMentorField(field))||MENTOR_FIELDS.at(-1);
  return Object.freeze({
    stage:row[0],stageLabel:row[1],field:subject[0],fieldLabel:subject[1],
    question:row[2],practice:row[3],
    expertLens:subject[2],
    guidance:'저자 자신의 경험과 생각을 출발점으로 삼고 사실·인용·권리는 직접 확인하세요. 실제 전문가 감수나 출판 승인을 대체하지 않습니다.',
    requiresPaidPlan:false,providerInvocation:false,
  });
}
export function privateMentorNotebook({title='',field='other',answers={}}={}) {
  const label=lookup(MENTOR_FIELDS,resolveMentorField(field))?.[1]||'기타·융합';
  const normalize=x=>String(x??'').replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim().slice(0,10000);
  const heading=normalize(title).replace(/\n/g,' ').slice(0,160)||'제목 미정';
  const sections=MENTOR_STAGES.map(([id,name])=>({name,answer:normalize(answers?.[id])}))
    .filter(x=>x.answer).map(x=>'## '+x.name+'\n\n'+x.answer);
  return Object.freeze({
    answered:sections.length,total:MENTOR_STAGES.length,
    markdown:'# '+heading+'\n\n분야: '+label+'\n\n> 비공개 개인 집필 노트입니다. 저작권은 저자의 창작 기여에 귀속되며, 이 노트는 출판·판매등록이나 전문 감수를 의미하지 않습니다.\n\n'+(sections.join('\n\n---\n\n')||'아직 기록한 문장이 없습니다.')+'\n',
    privateOnly:true,saleRegistrationAllowed:false,automaticProviderCostKrw:0,
  });
}
