(() => {
  const TOKEN_KEY='ekodi-auth-token';
  const LIFE_URL='https://life.ekodi.kr';
  const TOPICS=[['relationship','관계'],['money','돈'],['work','일·진로'],['family','가족'],['heart','마음'],['future','미래'],['faith','신앙'],['meaning','삶·의미']];
  const el=(tag,text='',cls='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n};
  function install(){
    if(!sessionStorage.getItem(TOKEN_KEY))return;
    const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content');
    if(!nav||!content||document.querySelector('#lifeAiAdmin'))return;
    let button=nav.querySelector('[data-section="life-ai"]');
    if(!button){button=el('button','','nav life-ai-nav');button.type='button';button.dataset.section='life-ai';button.append(document.createTextNode('Q '),el('span','인생AI'));const ai=nav.querySelector('[data-section="aiops"]');ai?.insertAdjacentElement('afterend',button)}
    const section=el('section','','section life-ai-admin hidden-panel');section.id='lifeAiAdmin';section.dataset.panel='life-ai';
    const head=el('header','','life-ai-admin-head');const copy=el('div');copy.append(el('p','LIFE AI · TODAY QUESTION','kicker'),el('h2','인생AI 운영'),el('p','오늘의 질문, 8개 삶의 주제, 말씀 연결, 오늘의 한 걸음, 공동체 연결 상태를 한곳에서 확인합니다.','operations-copy'));
    const actions=el('div','','life-ai-admin-actions');const refresh=el('button','새로고침','secondary');refresh.type='button';const open=el('a','서비스 열기 ↗','primary');open.href=LIFE_URL;open.target='_blank';open.rel='noopener';actions.append(refresh,open);head.append(copy,actions);section.append(head);
    const status=el('p','운영 상태를 확인하고 있습니다.','life-ai-admin-status');status.setAttribute('role','status');section.append(status);
    const grid=el('div','','life-ai-admin-grid');section.append(grid);
    const topics=el('section','','life-ai-admin-block');topics.append(el('h3','하위서비스 8개'),el('p','모든 주제는 같은 Life → Gospel Core를 사용하며 별도 AI 섬을 만들지 않습니다.'));
    const topicGrid=el('div','','life-ai-topic-grid');for(const [id,label] of TOPICS){const a=el('a','', 'life-ai-topic');a.href=`${LIFE_URL}/${id}`;a.target='_blank';a.rel='noopener';a.append(el('strong',label),el('small',id));topicGrid.append(a)}topics.append(topicGrid);section.append(topics);
    const policy=el('section','','life-ai-admin-block');policy.append(el('h3','운영 원칙'),el('p','비로그인 기본 대화 가능 · AI 공급자 독립 · 저장은 사용자 명시 동의 · 위기 상황은 사람 연결 우선 · 교회/공동체 참여 강제 없음 · 화이트라벨 지원'));section.append(policy);
    content.append(section);
    async function load(){status.textContent='운영 상태를 확인하고 있습니다.';try{const [h,t]=await Promise.all([fetch(`${LIFE_URL}/health`,{cache:'no-store'}),fetch(`${LIFE_URL}/api/today`,{cache:'no-store'})]);if(!h.ok||!t.ok)throw new Error(`HTTP ${h.status}/${t.status}`);const health=await h.json(),today=await t.json();grid.replaceChildren();for(const [label,value] of [['서비스',health.ok?'정상':'확인 필요'],['배포 단계',(health.stages||[]).join(' → ')],['하위서비스',String((health.areas||[]).length)],['화이트라벨',health.whiteLabel?'지원':'확인 필요'],['오늘의 질문',today.question||'-']]){const card=el('article','','life-ai-admin-card');card.append(el('small',label),el('strong',value));grid.append(card)}status.textContent=`${new Date().toLocaleTimeString('ko-KR')} 기준 · life.ekodi.kr 응답 정상`;}catch(error){status.textContent=`운영 상태 확인 실패: ${error.message||error}`;status.classList.add('error')}}
    refresh.addEventListener('click',load);load();
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed',{detail:{feature:'life-ai'}}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('ekodi-admin-authenticated',install);
})();
