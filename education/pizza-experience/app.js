// 청계초 1·2학년 공개 체험수업. 개인정보 수집·저장·외부 통신 없음.
const scenes = [
  {
    title: '반가워요, 꼬마 셰프 여러분!', label:'01 · 환영', emoji:'👩‍🍳',
    intro:'오늘은 모두 피자 요리사! 우리가 직접 만드는 특별한 여행을 시작해요.',
    question:'좋아하는 피자 토핑을 하나씩 외쳐 볼까요?',
    notes:'아이들 눈을 보며 손을 흔들어 인사합니다. 좋아하는 재료를 3~4명에게 물어보고 모든 답에 박수를 쳐 주세요.'
  },
  {
    title:'오늘의 꼬마 셰프 미션 3가지',label:'02 · 오늘의 미션',emoji:'⭐',
    intro:'재료를 알아보고, 안전하게 만들고, 친구의 작품을 칭찬해요.',
    visuals:[['🔎','재료 찾기'],['🫧','깨끗이 만들기'],['👏','서로 칭찬하기']],
    notes:'“우리가 오늘 할 일은 세 가지!” 손가락으로 하나, 둘, 셋을 세며 아이들과 함께 말해 봅니다.'
  },
  {
    title:'피자는 어디에서 유명해졌을까요?',label:'03 · 피자 여행',emoji:'🌍',
    intro:'동그란 빵 위에 맛있는 재료를 올려 만드는 피자. 특히 이탈리아의 피자가 세계적으로 유명해졌어요.',
    quiz:{options:['이탈리아 🇮🇹','달나라 🌙','남극 🐧'],correct:0,success:'정답! 이탈리아의 피자가 세계에 널리 알려졌어요.'},
    notes:'역사 강의는 길게 하지 않습니다. “달나라!”를 고른 아이도 웃으며 참여할 수 있도록 분위기를 만드세요.'
  },
  {
    title:'빨간 소스의 비밀',label:'04 · 토마토',emoji:'🍅',
    intro:'토마토로 만든 소스는 피자에 새콤달콤한 맛과 색을 더해 줘요.',
    question:'토마토는 보통 무슨 색일까요?',
    notes:'토마토 소스를 보여 주고 색을 함께 외칩니다. 음식 알레르기나 싫어하는 재료가 있는 친구의 선택도 존중합니다.'
  },
  {
    title:'쭉~ 늘어나는 치즈!',label:'05 · 치즈',emoji:'🧀',
    intro:'치즈는 따뜻해지면 녹아 부드러운 맛을 더해 줘요. 치즈는 보통 우유로 만들어요.',
    question:'치즈는 무엇으로 만들까요? 손을 들어 대답해 봐요!',
    notes:'우유 알레르기가 있는 아동은 반드시 대체 재료를 사용합니다. 치즈를 만지는 활동 전 도구를 확인하세요.'
  },
  {
    title:'알록달록 채소 친구들',label:'06 · 채소',emoji:'🥦',
    intro:'파프리카, 옥수수, 양파 등 각자 좋아하는 토핑을 고를 수 있어요.',
    visuals:[['🫑','파프리카'],['🌽','옥수수'],['🧅','양파']],
    question:'세 가지 중 여러분이 가장 좋아하는 것은?',
    notes:'토핑을 한 가지씩 보여 주고 손들기 투표를 합니다. 먹기 싫은 재료를 억지로 넣게 하지 마세요.'
  },
  {
    title:'피자의 튼튼한 바닥, 도우!',label:'07 · 도우',emoji:'🍞',
    intro:'도우는 피자의 바탕이 되는 반죽이에요. 소스와 치즈를 올릴 넓은 자리가 되어 줘요.',
    question:'동그란 피자 도우는 어떤 모양일까요?',
    notes:'손으로 큰 동그라미를 만들어 보게 합니다. 도우가 밀로 만들어지는 경우가 많으므로 밀 알레르기를 확인합니다.'
  },
  {
    title:'피자를 만들기 전, 첫 번째 일은?',label:'08 · 퀴즈',emoji:'🤔',
    intro:'맛있는 피자보다 먼저 해야 할 일이 있어요. 무엇일까요?',
    quiz:{options:['손 씻기 🫧','바로 먹기 🍕','친구 밀기 🏃'],correct:0,success:'맞아요! 깨끗한 손이 가장 먼저예요.'},
    notes:'정답을 고른 뒤 실제 손 씻기 장소로 이동할 준비를 합니다. 아이들은 음식과 기구를 만지기 전에 손을 씻습니다.'
  },
  {
    title:'보글보글, 손 씻기 약속!',label:'09 · 깨끗한 손',emoji:'🫧',
    intro:'비누로 손바닥, 손등, 손가락 사이까지 꼼꼼하게 씻어요.',
    visuals:[['🖐️','손바닥'],['🤲','손등·손가락'],['💧','잘 헹구기']],
    question:'우리 모두 깨끗한 손으로 시작할까요?',
    notes:'준비된 손 씻는 곳에서 모둠별로 이동합니다. 음식 준비 전 화장실 다녀오기, 손 씻기를 함께 확인합니다.'
  },
  {
    title:'안전 약속! 뜨거운 오븐은 어른만',label:'10 · 안전',emoji:'🔥',
    intro:'뜨거운 오븐과 팬은 만지지 않아요. 도구는 차례로 쓰고, 뛰지 않아요.',
    visuals:[['🙅','오븐 만지지 않기'],['🤝','차례 지키기'],['🚶','천천히 걷기']],
    question:'뜨거운 오븐은 누가 만질까요? “어른만!”',
    notes:'오븐과 열판 주변의 접근 금지선을 알려 주세요. 조리·운반·절단 작업은 어른이 맡습니다.'
  },
  {
    title:'내 피자의 멋진 이름을 정해요!',label:'11 · 상상력',emoji:'💡',
    intro:'우주 피자? 무지개 피자? 행복 피자? 무엇이든 좋아요.',
    visuals:[['🌈','무지개 피자'],['🚀','우주 피자'],['💛','행복 피자']],
    question:'나만의 피자 이름을 마음속으로 외쳐 볼까요?',
    notes:'종이에 이름을 적게 하거나 원하는 친구에게 말하게 합니다. 이름을 잘 못 짓는 친구에게는 “행복 피자”를 예시로 알려 주세요.'
  },
  {
    title:'이제 나만의 피자를 만들어 볼까요?',label:'12 · 가상 토핑 연습',emoji:'🍕',
    intro:'아래 토핑을 눌러 연습해요. 실제 피자는 도우 → 소스 → 치즈 → 토핑 순서로 만들어요.',
    builder:true,
    notes:'화면에서 한두 가지를 시연한 뒤 아이들이 각자의 자리에서 실물 피자를 만듭니다. 만드는 시간은 약 20분입니다. 실제 재료에 맞추어 안내하세요.'
  },
  {
    title:'피자가 구워지는 동안 숫자놀이!',label:'13 · 피자 수학',emoji:'🔢',
    intro:'친구 15명이 5명씩 모둠을 만들면 모두 몇 모둠일까요?',
    quiz:{options:['2모둠','3모둠','5모둠'],correct:1,success:'정답! 5명씩 3모둠이에요. 5 + 5 + 5 = 15!'},
    notes:'오븐은 어른이 관리합니다. 굽는 시간이 지연되면 3모둠이 차례로 “내 피자 이름”을 발표하게 합니다.'
  },
  {
    title:'모두 다르고, 모두 소중해요!',label:'14 · 마무리',emoji:'🎉',
    intro:'우리의 피자는 서로 달라도 모두 특별해요. 서로의 작품에 큰 박수를 보내요!',
    question:'“내 피자의 이름은 ___입니다!” 친구들에게 소개해 볼까요?',
    notes:'작품 발표는 강요하지 않고 희망하는 친구부터 합니다. 완성품은 식힌 뒤 안전하게 전달하고 정리와 인사로 마칩니다.'
  }
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
    let content = '<p class="scene-label">' + item.label + '</p>';
    if (item.emoji) content += '<div class="scene-emoji" aria-hidden="true">' + item.emoji + '</div>';
    content += '<h3>' + item.title + '</h3><p>' + item.intro + '</p>';
    if (item.visuals) {
      content += '<div class="scene-visuals" aria-label="오늘의 학습 이미지">' +
        item.visuals.map(function(pair){ return '<span aria-label="' + pair[1] + '">' + pair[0] + '<small>' + pair[1] + '</small></span>'; }).join('') +
        '</div>';
    }
    if (item.question) content += '<div class="question">' + item.question + '</div>';
    if (item.quiz) {
      content += '<div class="answer-buttons" role="group" aria-label="퀴즈 정답 고르기">';
      content += item.quiz.options.map(function(option,idx){ return '<button type="button" data-choice="' + idx + '">' + option + '</button>'; }).join('');
      content += '</div><div class="answer-feedback" id="answerFeedback" role="status"></div>';
    }
    if (item.builder) {
      content += '<div class="pizza-builder"><div class="make-pizza" id="makePizza" role="img" aria-label="토핑을 올리는 가상 피자"></div>';
      content += '<div class="topping-buttons" role="group" aria-label="토핑 골라 올리기">';
      content += '<button type="button" data-topping="tomato">🍅 토마토</button><button type="button" data-topping="cheese">🧀 치즈</button>';
      content += '<button type="button" data-topping="corn">🌽 옥수수</button><button type="button" data-topping="pepper">🫑 파프리카</button></div>';
      content += '<div class="builder-actions"><button type="button" id="clearToppings">피자 다시 꾸미기</button></div>';
      content += '<div class="answer-feedback" id="toppingStatus" role="status"></div></div>';
    }
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
  }
  sceneList.innerHTML = scenes.map(function(item,index) {
    return '<li><button type="button" data-scene="' + index + '"><span>' + String(index + 1).padStart(2,'0') + '</span>' + item.label.substring(5) + '</button></li>';
  }).join('');

  document.getElementById('prevScene').addEventListener('click',function(){if(current > 0) goTo(current - 1);});
  document.getElementById('nextScene').addEventListener('click',function(){goTo(current + 1);});
  sceneList.addEventListener('click',function(event){const btn = event.target.closest('button[data-scene]');if(btn) goTo(Number(btn.dataset.scene));});
  document.getElementById('startLesson').addEventListener('click',function() {
    goTo(0); document.getElementById('lesson-stage').scrollIntoView({behavior:'smooth',block:'start'});
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
    if (event.key === 'ArrowRight') {event.preventDefault(); goTo(current + 1);}
    if (event.key === 'ArrowLeft') {event.preventDefault(); if(current > 0) goTo(current - 1);}
  });

  stage.addEventListener('click',function(event){
    const choice = event.target.closest('[data-choice]');
    if (choice && scenes[current].quiz) {
      const correct = Number(choice.dataset.choice) === scenes[current].quiz.correct;
      const feedback = document.getElementById('answerFeedback');
      feedback.textContent = correct ? scenes[current].quiz.success : '괜찮아요! 다시 생각하고 골라 볼까요?';
      feedback.classList.toggle('is-incorrect', !correct);
      Array.from(stage.querySelectorAll('[data-choice]')).forEach(function(button){button.setAttribute('aria-pressed',String(button === choice));});
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
  document.querySelectorAll('.page-tabs a').forEach(function(link){
    link.addEventListener('click',function(){
      document.querySelectorAll('.page-tabs a').forEach(function(a){a.classList.toggle('selected',a===link);});
    });
  });

  render(); refreshTimer();
}
