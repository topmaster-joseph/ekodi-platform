// 청계초 1·2학년 공개 체험수업. 개인정보 수집·저장·외부 통신 없음.
// Based on the 14-slide "청계초_나만의피자체험_20261105.pptx" stored in Google Drive.
// Each time and instructor note follows the PPT order, including overlapping practice slides 9–10.
const scenes = [
  {
    title:'오늘은 내가 요리사! 나만의 피자, 내 손으로!',label:'01 · 환영',time:'09:20–09:23',emoji:'👩‍🍳',
    intro:'보고 · 웃고 · 만들고 · 함께 나눠요!',
    question:'피자 좋아하는 친구, 손!',
    notes:'09:20~09:23 (3분). 모두 환영! “오늘 여러분은 피자를 사 먹는 손님이 아니라, 만드는 요리사예요! 손들고 피자 좋아한다고 외쳐 볼까요?” 안전 및 알레르기 확인은 행사 전 교사와 별도로 완료. 아이들 사진 촬영은 학교 동의가 있을 때만.'
  },
  {
    title:'오늘의 미션 3가지',label:'02 · 미션 3가지',time:'09:23–09:25',emoji:'⭐',
    intro:'우리 모두 멋진 꼬마 셰프!',
    visuals:[['🔎','재료를 찾아요'],['🍕','내 피자를 만들어요'],['👏','함께 웃고 정리해요']],
    notes:'09:23~09:25 (2분). “우리 세 가지 미션 중에서 어떤 게 가장 신나요?” 한 아이가 한마디씩 짧게 답하도록 하고 모두 큰 박수.'
  },
  {
    title:'피자는 어디에서 올까요?',label:'03 · 농부의 손길',time:'09:25–09:29',emoji:'🌾',
    intro:'농부의 손길이 피자 한 판이 돼요. 무안 양파도 재료!',
    visuals:[['🌾','밀가루'],['🍅','토마토'],['🥛','우유로 만든 치즈'],['🧅','무안 양파']],
    question:'무안의 유명한 채소는?',
    notes:'09:25~09:29 (4분). “피자가 배달될 때만 생기나요? 아니에요! 밀과 채소를 키우는 농부, 우유를 만드는 낙농가, 피자를 만드는 요리사가 함께해요.” “무안에서 유명한 채소는?” 답: 양파. 실제 사용할 재료는 행사 준비 상황에 맞춘다.'
  },
  {
    title:'재료를 찾아라!',label:'04 · 재료 탐험',time:'09:29–09:32',emoji:'🍅',
    intro:'말랑말랑 도우 · 빨간 토마토 · 쭉쭉 치즈 · 아삭 채소',
    visuals:[['🍞','말랑말랑 도우'],['🍅','빨간 토마토'],['🧀','쭉쭉 치즈'],['🥬','아삭아삭 채소']],
    question:'내가 올리고 싶은 재료는?',
    notes:'09:29~09:32 (3분). 아이들이 재료 이름을 소리 내어 말하고, 가장 좋아하는 재료에 손들도록 유도. “도우는 무엇처럼 말랑해요?” 예: 빵반죽. 재료별 식품 알레르기가 있으므로 학생에게 맛보기를 강요하지 않는다.'
  },
  {
    title:'피자 만드는 순서',label:'05 · 만드는 순서',time:'09:32–09:35',emoji:'🍕',
    intro:'도우 → 소스 → 치즈 → 토핑',
    visuals:[['🍞','1 도우 펴기'],['🍅','2 소스 바르기'],['🧀','3 치즈 올리기'],['🫑','4 토핑 꾸미기']],
    question:'순서대로 함께 외쳐 볼까요?',
    notes:'09:32~09:35 (3분). 도우→소스→치즈→토핑을 다 같이 리듬을 붙여 말한다. 실제 현장 레시피와 순서가 다르면 슬라이드 문구를 수정. 어린이는 화기·칼·오븐에 접근하지 않도록 한다.'
  },
  {
    title:'손 씻기 탐정 퀴즈',label:'06 · 손 씻기',time:'09:35–09:38',emoji:'🫧',
    intro:'깨끗한 손이 첫 번째 재료!',
    quizzes:[
      {question:'만들기 전에는 손을 씻을까요?',options:['⭕ O','❌ X'],correct:0,success:'맞아요! 만들기 전에 손 씻기.'},
      {question:'기침·재채기 후에는?',options:['⭕ O','❌ X'],correct:0,success:'맞아요! 기침·재채기 후에도.'},
      {question:'화장실에 다녀온 뒤에는?',options:['⭕ O','❌ X'],correct:0,success:'맞아요! 화장실 후에도.'}
    ],
    notes:'09:35~09:38 (3분). “언제 손을 씻어야 할까요?” 모두 정답 O. 비누와 흐르는 물로 손을 충분히 씻고, 손 씻기 장소에 어른이 동행한다. 손 씻기 또는 손 위생 운영은 09:38~09:42에 분산 진행.'
  },
  {
    title:'꼬마 셰프 안전 약속',label:'07 · 안전 약속',time:'09:38–09:42',emoji:'🧼',
    intro:'우리 모두 즐겁고 안전하게!',
    visuals:[['🫧','손부터 깨끗하게'],['🤝','친구와 도구를 나눠요'],['🔥','뜨거운 오븐은 어른만!']],
    notes:'09:38~09:42 (4분, 손 씻기 병행). 모두가 약속을 큰소리로 따라 말한다. 뜨거운 오븐과 칼은 성인 진행자 전담. 동선·작업대·알레르기와 음식 위생을 재확인. “가장 중요한 약속은 세 가지 모두!”'
  },
  {
    title:'내 피자에게 이름을 지어 주세요',label:'08 · 피자 이름',time:'09:42–09:45',emoji:'💡',
    intro:'세상에 하나뿐인 내 피자!',
    visuals:[['🌈','무지개 피자'],['🌸','웃음꽃 피자'],['🚀','우주 탐험 피자']],
    question:'나의 피자 이름은?',
    notes:'09:42~09:45 (3분). “피자에도 멋진 이름을 붙여 볼까요?” 2~3명만 발표. 정답은 없고 모든 디자인이 훌륭함을 강조한다. 팀별로 재료를 나누고 본격 실습 준비.'
  },
  {
    title:'이제 진짜 피자를 만들어요!',label:'09 · 실습 20분',time:'09:45–10:05',emoji:'👩‍🍳',
    intro:'1 도우 → 2 소스 → 3 치즈 → 4 토핑',
    builder:true,
    notes:'09:45~10:05 (20분) 핵심 실습. 15명은 5명씩 세 테이블 권장. 테이블별 성인 보조 1명 배치 가능하면 이상적. 사전 준비: 개인용 도우 15장+예비, 소스/치즈/재료 알레르기 대체품, 일회용 장갑 또는 손 위생, 개별 트레이와 이름표, 도구, 쓰레기통. 실습 중 가위·칼·날카로운 도구 사용 금지. 반죽/도우는 식용에 적합한 사전 준비 제품 사용. 오븐 예열 완료. 오븐 용량과 예상 조리시간 미리 검증.'
  },
  {
    title:'토핑으로 그림을 그려 볼까?',label:'10 · 토핑 그림',time:'09:45–10:05 · 실습 중',emoji:'🎨',
    intro:'재료를 놓는 방법만 바꿔도 달라져요!',
    visuals:[['😊','웃는 얼굴'],['🌸','커다란 꽃'],['⭐','반짝 별']],
    question:'어떤 모양을 만들고 싶나요?',
    notes:'실습 중 보조 화면. “똑같이 하지 않아도 돼요. 웃는 얼굴, 꽃, 별, 좋아하는 모양 무엇이든 가능!” 아이들이 강사의 결과를 모방만 하지 않도록 창의성 강조. 이 슬라이드는 09:45~10:05 실습 동안 화면 유지 가능.'
  },
  {
    title:'피자가 익는 동안, 퀴즈!',label:'11 · 굽는 동안 퀴즈',time:'10:05–10:12',emoji:'❓',
    intro:'오븐은 어른에게 맡기고, 우리는 퀴즈!',
    quizzes:[
      {question:'Q1. 치즈는 무엇으로 만들까요?',options:['① 우유','② 사이다'],correct:0,success:'정답! 우유로 만들어요.'},
      {question:'Q2. 뜨거운 오븐은 누가 만질까요?',options:['① 어린이','② 어른'],correct:1,success:'정답! 어른만 만져요.'}
    ],
    notes:'10:05~10:12 (7분): 성인 담당자가 조리하며 질문. 정답 Q1: 우유, Q2: 어른. 화면에 정답 색이 노출되므로 “왜?”를 물어 설명을 유도. 실제 오븐 조리 시간과 가동 가능 용량에 따라 게임을 늘리거나 정리 활동으로 연결. 오븐에 15개 동시 조리할 수 없는 경우 작업 시작 순서를 조정해 앞선 조가 먼저 굽도록 사전 운영한다.'
  },
  {
    title:'다 같이 피자 수학!',label:'12 · 피자 수학',time:'10:12–10:18',emoji:'🔢',
    intro:'친구 15명이 피자를 1개씩 만들면?',
    question:'모두 몇 개일까요?',
    quiz:{options:['10개','15개','20개'],correct:1,success:'정답! 피자 15개! 5 + 5 + 5 = 15'},
    notes:'10:12~10:18 (6분). “우리 15명이 한 판씩 만들면 몇 판? 15판!” 1학년이 세기 어려워하면 5명씩 세 팀을 손으로 표시하고 5+5+5=15로 설명. 진짜 오븐에 들어간 개수, 아직 못 익은 개수를 같이 세어볼 수도 있음.'
  },
  {
    title:'진짜 요리사는 정리도 잘해요!',label:'13 · 함께 정리',time:'10:18–10:25',emoji:'🧹',
    intro:'내 자리 정리 · 도구 제자리 · 손 다시 씻기',
    visuals:[['🪑','내 자리 정리'],['🧺','도구 제자리'],['🫧','손 다시 씻기']],
    notes:'10:18~10:25 (7분) 조리 완료 대기 및 정리. 각자 사용한 도구를 반납하고 자리 정리. 피자를 만질 때는 뜨거우므로 진행자만 꺼내고 포장. 충분히 식힌 뒤 제공/포장. 알레르기 라벨 및 개인 식품 구별. 완성이 지연되면 피자는 교사가 인계하는 방식으로 사전 협의.'
  },
  {
    title:'우리 모두 멋진 피자 셰프!',label:'14 · 오늘의 주인공',time:'10:25–10:30',emoji:'🎉',
    intro:'서로 다른 피자, 모두 멋진 작품! 함께해 줘서 고마워요!',
    question:'“내 피자 이름은 ____!”',
    notes:'10:25~10:30 (5분). 완성품을 보여주며 “각자의 피자가 다르게 생겼죠? 다 달라서 더 좋아요.” “피자를 만드는 데 농부, 가게, 요리사, 친구가 모두 함께했죠.” 이름표와 포장 확인. 사진은 교사와 보호자 동의가 확인된 경우에만 촬영. 피자가 아직 식지 않았다면 뜨거움 주의 안내. 전체 활동 70분 종료.'
  }
];
const scenePhotos = [
  ['hero-pizza.webp','나만의 피자'],['chef.webp','피자를 만드는 요리사'],['ingredients.webp','농부의 재료'],
  ['ingredients.webp','도우 치즈 토마토 등 재료'],['making.webp','피자 만드는 단계'],['washing.webp','손 씻기'],
  ['washing.webp','손 씻기와 안전'],['raw.webp','나만의 피자 이름짓기'],['making.webp','피자 실습'],
  ['raw.webp','토핑으로 꾸미는 피자'],['oven.webp','피자 굽는 오븐'],['baked.webp','완성된 피자 15개'],
  ['washing.webp','작업대 정리'],['baked.webp','오늘의 피자 셰프']
];
const root = document.getElementById('pizza-exp');
if (root) initialize();

function initialize() {
  const stage = document.getElementById('scene');
  const sceneList = document.getElementById('sceneList');
  const stageShell = document.getElementById('stageShell');
  const notes = document.getElementById('instructorNotes');
  let current = 0;
  let showNotes = false;
  let toppings = [];
  let presetSeconds = 300;
  let remainingSeconds = presetSeconds;
  let deadline = 0;
  let timerHandle = null;

  function render() {
    const item = scenes[current];
    document.getElementById('sceneCounter').textContent = String(current + 1) + ' / ' + scenes.length;
    document.getElementById('sceneKind').textContent = item.label;
    document.getElementById('progressBar').setAttribute('aria-valuenow', String(current + 1));
    // Progress width follows the aria-valuenow state in CSS; CSP forbids inline styles.
    document.getElementById('notesText').textContent = item.notes;
    notes.hidden = !showNotes;
    const photo = scenePhotos[current];
    let content = '<div class="scene-photo-frame"><img src="./photos/' + photo[0] + '" alt="' + photo[1] + '" draggable="false"></div><div class="scene-detail">';
    content += '<p class="scene-label">' + item.label + ' · ' + item.time + '</p>';
    if(item.emoji) content += '<div class="scene-emoji" aria-hidden="true">' + item.emoji + '</div>';
    content += '<h3>' + item.title + '</h3><p>' + item.intro + '</p>';
    if(item.visuals){
      content += '<div class="scene-visuals" aria-label="학습 항목">' +
        item.visuals.map(pair => '<span aria-label="' + pair[1] + '">' + pair[0] + '<small>' + pair[1] + '</small></span>').join('') + '</div>';
    }
    if(item.question) content += '<div class="question">' + item.question + '</div>';
    if(item.quiz){
      content += '<div class="answer-buttons" role="group" aria-label="퀴즈 정답">' +
        item.quiz.options.map((option,index) => '<button type="button" data-choice="' + index + '">' + option + '</button>').join('') +
        '</div><div class="answer-feedback" id="answerFeedback" role="status"></div>';
    }
    if(item.quizzes){
      content += '<div class="slide-quiz-list">' + item.quizzes.map((quiz,index) =>
        '<div class="slide-quiz" data-quiz-group="' + index + '"><div class="question">' + quiz.question + '</div>' +
        '<div class="answer-buttons" role="group" aria-label="퀴즈 ' + (index+1) + ' 답하기">' +
        quiz.options.map((option,optionIndex) => '<button type="button" data-choice="' + optionIndex + '">' + option + '</button>').join('') +
        '</div><div class="answer-feedback" role="status"></div></div>'
      ).join('') + '</div>';
    }
    if(item.builder){
      content += '<div class="pizza-builder"><div class="make-pizza" id="makePizza" role="img" aria-label="토핑을 올리는 가상 피자"></div>' +
        '<div class="topping-buttons" role="group" aria-label="토핑 골라 올리기">' +
        '<button type="button" data-topping="tomato">🍅 토마토</button><button type="button" data-topping="cheese">🧀 치즈</button>' +
        '<button type="button" data-topping="corn">🌽 옥수수</button><button type="button" data-topping="pepper">🫑 파프리카</button></div>' +
        '<div class="builder-actions"><button type="button" id="clearToppings">다시 꾸미기</button></div>' +
        '<div class="answer-feedback" id="toppingStatus" role="status"></div></div>';
    }
    content += '</div>';
    stage.innerHTML = content;
    const prev = document.getElementById('prevScene');
    const next = document.getElementById('nextScene');
    prev.disabled = current === 0;
    next.textContent = current === scenes.length - 1 ? '처음으로 ↺' : '다음 →';
    Array.from(sceneList.querySelectorAll('button')).forEach(function(button, index) {
      if (index === current) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
    if (item.builder) renderPizza();
  }

  function goTo(index) {
    current = (index + scenes.length) % scenes.length;
    render();
    sceneList.querySelector('[aria-current="step"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  sceneList.innerHTML = scenes.map(function(item,index) {
    return '<li><button type="button" data-scene="' + index + '" title="' + item.time + ' · ' + item.label + '"><img src="./photos/' + scenePhotos[index][0] + '" alt="" loading="lazy"><span class="scene-label-small">' + String(index + 1).padStart(2,'0') + ' · ' + item.label.split('·').slice(1).join('·').trim() + '</span></button></li>';
  }).join('');

  document.getElementById('prevScene').addEventListener('click',function(){if(current > 0) goTo(current - 1);});
  document.getElementById('nextScene').addEventListener('click',function(){goTo(current + 1);});
  sceneList.addEventListener('click',function(event){const btn = event.target.closest('button[data-scene]');if(btn) goTo(Number(btn.dataset.scene));});
  document.getElementById('startLesson').addEventListener('click',function() {
    goTo(0); switchView('lesson');
  });
  document.getElementById('notesToggle').addEventListener('click',function(event){
    showNotes = !showNotes;
    event.currentTarget.setAttribute('aria-pressed',String(showNotes));
    event.currentTarget.textContent = showNotes ? '진행 멘트 닫기' : '진행 멘트 보기';
    notes.hidden = !showNotes;
  });
  document.getElementById('fullscreenButton').addEventListener('click',async function(){
    try {
      if (document.fullscreenElement === stageShell) await document.exitFullscreen();
      else if (stageShell.requestFullscreen) await stageShell.requestFullscreen();
      else document.getElementById('timerNotice').textContent = '전체화면을 지원하지 않는 브라우저입니다.';
    } catch { document.getElementById('timerNotice').textContent = '전체화면 사용이 제한되어 있습니다.'; }
  });
  document.addEventListener('fullscreenchange',function(){
    document.getElementById('fullscreenButton').textContent = document.fullscreenElement ? '전체화면 닫기' : '전체화면';
  });
  document.addEventListener('keydown',function(event){
    if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') {event.preventDefault(); goTo(current + 1); switchView('lesson');}
    if (event.key === 'ArrowLeft') {event.preventDefault(); if(current > 0) goTo(current - 1); switchView('lesson');}
  });

  stage.addEventListener('click',function(event){
    const choice = event.target.closest('[data-choice]');
    if(choice){
      const group=choice.closest('[data-quiz-group]');
      const quiz=group ? scenes[current].quizzes?.[Number(group.dataset.quizGroup)] : scenes[current].quiz;
      if(quiz){
        const correct=Number(choice.dataset.choice)===quiz.correct;
        const scope=group||stage;
        const feedback=scope.querySelector('.answer-feedback');
        if(feedback){
          feedback.textContent=correct?quiz.success:'다시 생각해 볼까요?';
          feedback.classList.toggle('is-incorrect',!correct);
        }
        Array.from(scope.querySelectorAll('[data-choice]')).forEach(button=>button.setAttribute('aria-pressed',String(button===choice)));
      }
    }
    const toppingButton = event.target.closest('[data-topping]');
    if (toppingButton) {
      if (toppings.length >= 12) {
        document.getElementById('toppingStatus').textContent = '피자가 가득 찼어요! 맛있게 꾸몄네요.';
        return;
      }
      const type = toppingButton.dataset.topping;
      if (['tomato','cheese','corn','pepper'].includes(type)) toppings.push(type);
      renderPizza();
    }
    if (event.target.closest('#clearToppings')) { toppings=[]; renderPizza(); }
  });

  function renderPizza() {
    const host = document.getElementById('makePizza');
    if (!host) return;
    const values = {tomato:'🍅',cheese:'🧀',corn:'🌽',pepper:'🫑'};
    host.innerHTML = toppings.map(function(type){
      return '<span class="placed-topping" aria-hidden="true">' + values[type] + '</span>';
    }).join('');
    host.setAttribute('aria-label','토핑이 ' + toppings.length + '개 올려진 가상 피자');
    const status=document.getElementById('toppingStatus');
    if(status) status.textContent=toppings.length ? toppings.length + '개의 토핑을 올렸어요!' : '어떤 토핑을 올릴까요?';
  }

  function formatTimer(seconds) {
    return String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
  }
  function refreshTimer() {
    document.getElementById('timerDisplay').textContent = formatTimer(remainingSeconds);
    const toggle=document.getElementById('timerToggle');
    toggle.textContent = timerHandle ? '일시정지' : '시작';
  }
  function stopTimer() {
    if(timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }
  function tick() {
    remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if(remainingSeconds === 0){
      stopTimer();
      document.getElementById('timerNotice').textContent = '시간이 되었어요! 다음 활동으로 이동해요.';
    }
    refreshTimer();
  }
  document.getElementById('timerToggle').addEventListener('click',function(){
    if(timerHandle) {
      tick(); stopTimer(); refreshTimer();
      document.getElementById('timerNotice').textContent = '타이머를 잠시 멈췄어요.';
      return;
    }
    if(remainingSeconds <= 0) remainingSeconds = presetSeconds;
    deadline=Date.now() + remainingSeconds * 1000;
    timerHandle=setInterval(tick,250);
    document.getElementById('timerNotice').textContent = '타이머가 진행 중입니다.';
    refreshTimer();
  });
  document.getElementById('timerReset').addEventListener('click',function(){
    stopTimer(); remainingSeconds=presetSeconds; refreshTimer();
    document.getElementById('timerNotice').textContent = '시간을 초기화했어요.';
  });
  document.querySelectorAll('[data-minutes]').forEach(function(button){
    button.addEventListener('click',function(){
      stopTimer();
      presetSeconds=Number(button.dataset.minutes)*60;remainingSeconds=presetSeconds;
      document.querySelectorAll('[data-minutes]').forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});
      document.getElementById('timerNotice').textContent = String(presetSeconds/60) + '분으로 설정했어요.';
      refreshTimer();
    });
  });
  document.getElementById('printPlan').addEventListener('click',function(){window.print();});
  document.querySelectorAll('[data-view]').forEach(function(button){
    button.addEventListener('click',function(){switchView(button.dataset.view);});
  });
  document.querySelectorAll('[data-quick-scene]').forEach(function(button){
    button.addEventListener('click',function(){goTo(Number(button.dataset.quickScene));switchView('lesson');});
  });
  function switchView(view){
    const views=['home','lesson','video','music','plan','safety','finale'];
    if(!views.includes(view))return;
    document.querySelectorAll('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==view;});
    document.querySelectorAll('.experience-tabs [data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  }

  initializeMusic();
  render(); refreshTimer();
}

function initializeMusic() {
  const audio=document.getElementById('pizzaMusic');
  const toggles=Array.from(document.querySelectorAll('[data-music-toggle]'));
  const volume=document.getElementById('pizzaMusicVolume');
  const status=document.getElementById('pizzaMusicStatus');
  if(!audio||!toggles.length)return;
  // Original EKODI instrumental; playback requires an explicit user click.
  audio.volume=Number(volume?.value??20)/100;
  function sync() {
    const playing=!audio.paused;
    toggles.forEach(button=>{
      button.textContent=playing?'■ 음악 중지':'♪ 음악 재생';
      button.setAttribute('aria-pressed',String(playing));
    });
    if(status)status.textContent=playing?'음악 재생 중':'음악 중지';
  }
  function stopMusic() {
    audio.pause();
    try{audio.currentTime=0;}catch{/* unseekable prior to load */}
    sync();
  }
  for(const button of toggles){
    button.addEventListener('click',async()=>{
      if(!audio.paused){stopMusic();return;}
      stopYoutube();
      try{await audio.play();}
      catch{if(status)status.textContent='음악을 재생할 수 없습니다.';}
      sync();
    });
  }
  volume?.addEventListener('input',()=>{audio.volume=Number(volume.value)/100;});
  const stopYoutube=initializeYoutubeMusic(stopMusic);
  document.querySelectorAll('[data-pizza-video]').forEach(link=>link.addEventListener('click',()=>{stopMusic();stopYoutube();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMusic();});
  window.addEventListener('pagehide',stopMusic);
  audio.addEventListener('play',sync);
  audio.addEventListener('pause',sync);
  audio.addEventListener('error',()=>{if(status)status.textContent='음악 파일을 확인해주세요.';});
  sync();
}

function parseYoutubeId(value){
  try {
    const u=new URL(String(value||'').trim());
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';
    const h=u.hostname.toLowerCase();
    let id='';
    if(h==='youtu.be')id=u.pathname.split('/')[1]||'';
    else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com'].includes(h)){
      const parts=u.pathname.split('/').filter(Boolean);
      if(parts[0]==='watch')id=u.searchParams.get('v')||'';
      else if(['embed','shorts','live','v'].includes(parts[0]))id=parts[1]||'';
    }else return '';
    return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
  }catch{return '';}
}
function initializeYoutubeMusic(stopLocalMusic){
  const form=document.getElementById('youtubeMusicForm');
  const input=document.getElementById('youtubeMusicUrl');
  const status=document.getElementById('youtubeMusicMessage');
  const target=document.getElementById('youtubePlayerFrame');
  const dock=document.getElementById('youtubePlayerDock');
  const stop=document.getElementById('stopYoutubeMusic');
  const close=document.getElementById('closeYoutubeDock');
  const external=document.getElementById('openYoutubeNewWindow');
  function updateExternalLink(){
    const id=parseYoutubeId(input.value);
    if(!external)return;
    external.href=id?'https://www.youtube.com/watch?v='+id:'#';
    external.setAttribute('aria-disabled',String(!id));
    external.tabIndex=id?0:-1;
  }
  input.addEventListener('input',updateExternalLink);
  external?.addEventListener('click',event=>{
    if(!parseYoutubeId(input.value)){event.preventDefault();status.textContent='먼저 올바른 유튜브 주소를 입력하세요.';return;}
    stopYoutube();
    stopLocalMusic();
    status.textContent='유튜브 새 창으로 연결합니다. 새 창에서 ▶를 눌러 주세요.';
  });
  updateExternalLink();
  function stopYoutube(){
    target.replaceChildren();
    dock.hidden=true;
    stop.disabled=true;
    if(status)status.textContent='유튜브 음악 중지';
  }
  form.addEventListener('submit',function(event){
    event.preventDefault();
    const id=parseYoutubeId(input.value);
    if(!id){status.textContent='올바른 유튜브 주소를 넣어 주세요.';return;}
    stopYoutube();
    stopLocalMusic();
    updateExternalLink();
    const frame=document.createElement('iframe');
    frame.title='유튜브 배경음악 재생';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
    frame.setAttribute('allowfullscreen','');
    frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&controls=1&enablejsapi=1&origin='+encodeURIComponent(location.origin);
    target.appendChild(frame);
    dock.hidden=false;
    stop.disabled=false;
    status.textContent='화면에서 재생되지 않으면 「새 창에서 듣기」를 선택하세요.';
  });
  stop.addEventListener('click',stopYoutube);
  close.addEventListener('click',stopYoutube);
  window.addEventListener('pagehide',stopYoutube);
  return stopYoutube;
}
