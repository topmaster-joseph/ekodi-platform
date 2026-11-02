(() => {
  'use strict';

  // Use the original text displayed on the five prayer slides (35–39).
  // The parenthesized Korean reading guides are not spoken as part of the foreign-language prayers.
  const prayers = {
    ko: {
      label: '한국어', locale: 'ko-KR', lines: [
        '하늘에 계신 우리 아버지,',
        '아버지의 이름을 거룩하게 하시며 아버지의 나라가 오게 하시며',
        '아버지의 뜻이 하늘에서와 같이 땅에서도 이루어지게 하소서.',
        '오늘 우리에게 일용할 양식을 주시고',
        '우리가 우리에게 잘못한 사람을 용서하여 준 것 같이 우리 죄를 용서하여 주시고',
        '우리를 시험에 빠지지 않게 하시고 악에서 구하소서.',
        '나라와 권능과 영광이 영원히 아버지의 것입니다. 아멘.'
      ]
    },
    en: {
      label: 'English', locale: 'en-US', lines: [
        'Our Father which art in heaven,',
        'Hallowed be thy name. Thy kingdom come.',
        'Thy will be done in earth, as it is in heaven.',
        'Give us this day our daily bread.',
        'And forgive us our debts, as we forgive our debtors.',
        'And lead us not into temptation, but deliver us from evil:',
        'For thine is the kingdom, and the power, and the glory, for ever. Amen.'
      ]
    },
    zh: {
      label: '中文', locale: 'zh-CN', lines: [
        '我们在天上的父：',
        '愿人都尊你的名为圣。愿你的国降临。',
        '愿你的旨意行在地上，如同行在天上。',
        '我们日用的饮食，今日赐给我们。',
        '免我们的债，如同我们免了人的债。',
        '不叫我们遇见试探，救我们脱离凶恶。',
        '因为国度、权柄、荣耀，全是你的，直到永远。阿们。'
      ]
    },
    ja: {
      label: '日本語', locale: 'ja-JP', lines: [
        '天にまします我らの父よ、',
        '願わくは御名をあがめさせたまえ。御国を来たらせたまえ。',
        '御心の天になるごとく、地にもなさせたまえ。',
        '我らの日用の糧を、今日も与えたまえ。',
        '我らに罪を犯す者を我らが赦すごとく、',
        '我らの罪をも赦したまえ。',
        '我らを試みにあわせず、悪より救い出したまえ。',
        '国と力と栄えとは、限りなく汝のものなればなり。アーメン。'
      ]
    },
    vi: {
      label: 'Tiếng Việt', locale: 'vi-VN', lines: [
        'Lạy Cha chúng con ở trên trời,',
        'danh Cha được thánh. Nước Cha được đến.',
        'Ý Cha được nên, ở đất như trời.',
        'Xin cho chúng con hôm nay đồ ăn đủ ngày.',
        'Xin tha tội lỗi cho chúng con,',
        'như chúng con cũng tha kẻ phạm tội nghịch cùng chúng con.',
        'Xin chớ để chúng con bị cám dỗ,',
        'mà cứu chúng con khỏi điều ác.',
        'Vì nước, quyền, vinh hiển đều thuộc về Cha đời đời. A-men.'
      ]
    }
  };

  const langs = Object.keys(prayers);
  const requested = new URLSearchParams(location.search).get('lang');
  let currentLang = langs.includes(requested) ? requested : 'ko';
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const voiceStatus = document.getElementById('voice-status');
  const status = document.getElementById('playback-status');
  const linesEl = document.getElementById('prayer-lines');
  const tabsEl = document.getElementById('language-tabs');
  const playAll = document.getElementById('play-all');
  const pause = document.getElementById('pause');
  const stopButton = document.getElementById('stop');
  const rate = document.getElementById('rate');
  const rateLabel = document.getElementById('rate-label');
  const repeat = document.getElementById('repeat');
  let voices = [];
  let currentVoice = null;
  let sequence = [];
  let generation = 0;
  let playing = false;
  let paused = false;

  function chooseVoice() {
    voices = synth ? synth.getVoices() : [];
    const locale = prayers[currentLang].locale.toLowerCase();
    const language = locale.split('-')[0];
    currentVoice = voices.find(v => v.lang.replace('_','-').toLowerCase() === locale)
      || voices.find(v => v.lang.replace('_','-').toLowerCase().startsWith(language + '-'))
      || voices.find(v => v.lang.replace('_','-').toLowerCase() === language)
      || null;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      voiceStatus.textContent = '이 브라우저에서는 음성 합성을 지원하지 않습니다. 최신 Chrome 또는 Edge에서 열어 주세요.';
    } else if (!currentVoice) {
      voiceStatus.textContent = prayers[currentLang].label + ' 음성이 기기에 준비되지 않았습니다. 브라우저 또는 운영체제의 언어별 음성팩을 확인하세요.';
    } else {
      voiceStatus.textContent = '재생 음성: ' + currentVoice.name + ' (' + currentVoice.lang + ') · 브라우저 음성 엔진을 사용합니다.';
    }
    playAll.disabled = !currentVoice;
    linesEl.querySelectorAll('.play-line').forEach(button => { button.disabled = !currentVoice; });
  }

  function markActive(index) {
    linesEl.querySelectorAll('li').forEach((item,i) => {
      if (i === index) item.dataset.active = 'true';
      else delete item.dataset.active;
    });
  }

  function resetPlayback(message) {
    playing = false;
    paused = false;
    sequence = [];
    markActive(-1);
    pause.disabled = true;
    pause.textContent = '⏸ 일시정지';
    stopButton.disabled = true;
    if (message) status.textContent = message;
  }

  function cancel(message) {
    generation++;
    if (synth) synth.cancel();
    resetPlayback(message);
  }

  function next(token) {
    if (generation !== token || !playing) return;
    if (!sequence.length) {
      resetPlayback('발음 듣기가 끝났습니다. 다시 듣거나 다른 문장을 선택하세요.');
      return;
    }
    const index = sequence.shift();
    const prayer = prayers[currentLang];
    const utterance = new window.SpeechSynthesisUtterance(prayer.lines[index]);
    utterance.lang = prayer.locale;
    utterance.voice = currentVoice;
    utterance.rate = Number(rate.value);
    utterance.pitch = 1;
    utterance.volume = 1;
    markActive(index);
    status.textContent = prayer.label + ' · ' + (index+1) + '/' + prayer.lines.length + '번 문장을 듣고 따라 읽으세요.';
    utterance.onend = () => { if (generation === token) next(token); };
    utterance.onerror = event => {
      if (generation !== token) return;
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      cancel('음성 재생 오류가 발생했습니다(' + event.error + '). 언어별 음성팩과 브라우저 설정을 확인하세요.');
    };
    synth.speak(utterance);
  }

  function start(indices) {
    chooseVoice();
    if (!currentVoice || !synth) {
      status.textContent = '해당 언어의 음성이 없어서 재생할 수 없습니다. 기기 음성팩을 설치한 뒤 다시 시도하세요.';
      return;
    }
    cancel();
    playing = true;
    pause.disabled = false;
    stopButton.disabled = false;
    const twice = repeat.checked;
    sequence = indices.flatMap(index => twice ? [index,index] : [index]);
    next(generation);
  }

  function selectLanguage(lang) {
    if (!prayers[lang]) return;
    cancel('원하는 문장을 눌러 발음 연습을 시작하세요.');
    currentLang = lang;
    document.documentElement.lang = prayers[lang].locale;
    const url = new URL(location.href);
    url.searchParams.set('lang',lang);
    history.replaceState(null,'',url);
    document.getElementById('prayer-heading').textContent = '주기도문 · ' + prayers[lang].label;
    tabsEl.replaceChildren();
    for (const key of langs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role','tab');
      button.setAttribute('aria-selected',String(key === lang));
      button.textContent = prayers[key].label;
      button.addEventListener('click',() => selectLanguage(key));
      tabsEl.append(button);
    }
    linesEl.replaceChildren();
    prayers[lang].lines.forEach((text,index) => {
      const item = document.createElement('li');
      const paragraph = document.createElement('p');
      paragraph.lang = prayers[lang].locale;
      paragraph.textContent = text;
      const button = document.createElement('button');
      button.className = 'play-line';
      button.type = 'button';
      button.textContent = '▶ ' + (index+1) + '번 듣기';
      button.setAttribute('aria-label',(index+1)+'번 문장 발음 듣기');
      button.addEventListener('click',() => start([index]));
      item.append(paragraph,button);
      linesEl.append(item);
    });
    chooseVoice();
  }

  rate.addEventListener('input',() => { rateLabel.textContent = Number(rate.value).toFixed(2) + '×'; });
  playAll.addEventListener('click',() => start(prayers[currentLang].lines.map((_,i)=>i)));
  pause.addEventListener('click',() => {
    if (!playing || !synth) return;
    if (paused) {
      synth.resume();
      paused = false;
      pause.textContent = '⏸ 일시정지';
      status.textContent = '이어서 발음을 듣습니다.';
    } else {
      synth.pause();
      paused = true;
      pause.textContent = '▶ 계속 듣기';
      status.textContent = '일시정지되었습니다.';
    }
  });
  stopButton.addEventListener('click',() => cancel('재생을 정지했습니다.'));
  window.addEventListener('pagehide',() => cancel());
  if (synth && typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged',chooseVoice);
  } else if (synth) {
    synth.onvoiceschanged = chooseVoice;
  }
  selectLanguage(currentLang);
})();