import { devotionSpeechSegments } from './devotion-share-audio.js';
import { isApprovedOfficialBibleHost } from './devotion-scripture-versions.js';
import { createEkodiNarrationPlayer } from './devotion-ekodi-narration.js';
import { chooseKoreanVoice, koreanVoices, knownKoreanVoiceGender, preferredKoreanDeviceVoice } from './devotion-voice-catalog.js';

// Device voice quality varies. Prefer explicitly named natural Korean voices,
// offer verified male/female speaker choices, and never claim gender by pitch.
// No autoplay, voice cloning, paid provider, or hidden transcription upload.
export function createDevotionSpeechUI(win = window, doc = document) {
  const row = doc.createElement('section');
  row.className = 'dv-speech-tools';
  row.hidden = true;
  row.setAttribute('aria-label', '매일묵상 본문 듣기');

  const button = (name, label) => {
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = 'dv-btn dv-speech-btn';
    node.dataset.speechAction = name;
    node.textContent = label;
    return node;
  };
  const createOption = (value, label) => {
    const opt = doc.createElement('option');
    opt.value = value;
    opt.textContent = label;
    return opt;
  };
  const play = button('play', '본문 듣기');
  const pause = button('pause', '일시정지');
  const repeat = button('repeat', '다시듣기');
  const stopButton = button('stop', '정지');
  const loopButton = button('loop', '반복듣기');
  loopButton.className += ' dv-speech-loop';
  loopButton.setAttribute('aria-pressed', 'false');
  loopButton.setAttribute('aria-label', '반복듣기 켜기');

  const speedLabel = doc.createElement('label');
  speedLabel.className = 'dv-speech-speed';
  speedLabel.textContent = '낭독 속도 ';
  const speed = doc.createElement('select');
  speed.setAttribute('aria-label', '낭독 속도');
  speed.append(
    createOption('0.82', '천천히'),
    createOption('0.94', '차분하게'),
    createOption('1.06', '조금 빠르게'),
  );
  speed.value = '0.94';
  speedLabel.append(speed);

  const genderLabel = doc.createElement('label');
  genderLabel.className = 'dv-speech-gender';
  genderLabel.textContent = '목소리 ';
  const gender = doc.createElement('select');
  gender.setAttribute('aria-label', '남성 또는 여성 목소리');
  gender.append(
    createOption('auto', '자동'),
    createOption('male', '남성'),
    createOption('female', '여성'),
  );
  gender.value = 'auto';
  genderLabel.append(gender);

  const voiceLabel = doc.createElement('label');
  voiceLabel.className = 'dv-speech-voice';
  voiceLabel.textContent = '기기 음성 ';
  const voice = doc.createElement('select');
  voice.setAttribute('aria-label', '설치된 한국어 음성 직접 선택');
  voice.append(createOption('', '자동 선택'));
  voice.value = '';
  voiceLabel.append(voice);

  const status = doc.createElement('span');
  status.className = 'dv-speech-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  // Preserve the existing base control ordering for older screen-reader/test clients.
  const engineLabel = doc.createElement('label');
  engineLabel.className = 'dv-speech-engine';
  engineLabel.textContent = '낭독 방식 ';
  const engine = doc.createElement('select');
  engine.setAttribute('aria-label', '에코디 낭독음성 또는 기기 음성');
  const ekodiOption = createOption('ekodi', '에코디 낭독 · 준비 중');
  ekodiOption.disabled = true;
  engine.append(ekodiOption, createOption('device', '기기 음성'));
  engine.value = 'device';
  engineLabel.append(engine);
  // Minimal primary controls; existing capabilities remain under one settings toggle.
  const moreSettings=button('settings','음성 설정');
  moreSettings.className+=' dv-speech-more';
  moreSettings.setAttribute('aria-expanded','false');
  row.dataset.advanced='false';
  row.append(play, pause, repeat, stopButton, speedLabel, status, genderLabel, voiceLabel, engineLabel, loopButton, moreSettings);
  moreSettings.addEventListener('click',()=>{
    const expanded=row.dataset.advanced!=='true';
    row.dataset.advanced=String(expanded);
    moreSettings.textContent=expanded?'설정 닫기':'음성 설정';
    moreSettings.setAttribute('aria-expanded',String(expanded));
  });

  const synth = win.speechSynthesis;
  const Utterance = win.SpeechSynthesisUtterance;
  const supported = Boolean(synth && Utterance && typeof synth.speak === 'function');
  const ekodi = createEkodiNarrationPlayer(win);
  let loopEnabled = false;
  let data = null;
  let generation = 0;
  let segments = [];
  let index = 0;
  let playing = false;
  let paused = false;
  let nextTimer = null;
  let preferredVoice = '';
  let officialSelection = null;

  function updateLoopButton() {
    loopButton.textContent = loopEnabled ? '반복듣기 켜짐' : '반복듣기';
    loopButton.setAttribute('aria-pressed', String(loopEnabled));
    loopButton.setAttribute('aria-label', loopEnabled ? '반복듣기 끄기' : '반복듣기 켜기');
    ekodi.setLoop(loopEnabled);
  }

  const preferenceKey = 'ekodi-devotion-voice-preference-v1';
  function readPreference() {
    try {
      const value = JSON.parse(win.localStorage?.getItem(preferenceKey) || 'null');
      if (['auto','male','female'].includes(value?.gender)) gender.value = value.gender;
      if (['0.82','0.94','1.06'].includes(value?.speed)) speed.value = value.speed;
      if (typeof value?.voice === 'string' && value.voice.length < 160) preferredVoice = value.voice;
    } catch {}
  }
  function savePreference() {
    try {
      win.localStorage?.setItem(preferenceKey, JSON.stringify({
        gender:gender.value, speed:speed.value, voice:voice.value,
      }));
    } catch {}
  }
  function getVoices() {
    try { return typeof synth?.getVoices === 'function' ? synth.getVoices() : []; }
    catch { return []; }
  }
  function display(message) {
    status.textContent = message;
    row.dataset.playing=String(Boolean(playing));
    if(officialSelection){
      loopButton.disabled = true;
      play.textContent='공식 듣기';
      play.disabled=!data?.found||!officialSelection.url;
      pause.disabled=true;repeat.disabled=true;stopButton.disabled=true;
      return;
    }
    loopButton.disabled = !supported || !data?.found;
    play.textContent='본문 듣기';
    play.disabled = (!supported && !ekodi.ready) || !data?.found || playing;
    pause.disabled = !playing;
    repeat.disabled = (!supported && !ekodi.ready) || !data?.found;
    stopButton.disabled = !playing;
    pause.textContent = paused ? '계속 듣기' : '일시정지';
  }
  function describeChoice() {
    const all = koreanVoices(getVoices());
    if (!all.length) return '기기의 한국어 음성을 확인하는 중입니다.';
    const selected = voice.value
      ? chooseKoreanVoice(all, 'auto', voice.value)
      : chooseKoreanVoice(all, gender.value);
    if (selected) {
      const kind = knownKoreanVoiceGender(selected);
      const suffix = kind === 'male' ? ' · 남성' : kind === 'female' ? ' · 여성' : '';
      return '선택된 한국어 음성: ' + selected.name + suffix;
    }
    if (gender.value === 'male' || gender.value === 'female')
      return (gender.value === 'male' ? '남성' : '여성') + ' 한국어 음성이 이 기기에 없습니다. 기기 음성 목록을 확인하거나 자동을 선택해 주세요.';
    return '사용 가능한 한국어 음성을 선택해 주세요.';
  }
  function refreshVoices() {
    const previouslyChosen = preferredVoice;
    const list = koreanVoices(getVoices());
    const options = [createOption('', '자동 선택')];
    for (const item of list) {
      const kind = knownKoreanVoiceGender(item);
      const label = item.name + (kind === 'male' ? ' (남성)' : kind === 'female' ? ' (여성)' : '');
      options.push(createOption(String(item.voiceURI || item.name), label));
    }
    if (typeof voice.replaceChildren === 'function') voice.replaceChildren(...options);
    else voice.children = options; // minimal DOM-like testing environments
    const fallback = gender.value === 'auto'
      ? preferredKoreanDeviceVoice(list)
      : chooseKoreanVoice(list, gender.value);
    const fallbackURI = fallback ? String(fallback.voiceURI || fallback.name) : '';
    voice.value = list.some(v => String(v.voiceURI || v.name) === previouslyChosen)
      ? previouslyChosen : fallbackURI;
    voice.disabled = list.length === 0;
    if (data?.found && !playing) display(describeChoice());
  }
  function stop() {
    ++generation;
    playing = false;
    paused = false;
    segments = [];
    index = 0;
    if (nextTimer != null) { win.clearTimeout?.(nextTimer); nextTimer = null; }
    if (supported) synth.cancel();
    ekodi.stop();
    display(data?.found ? '듣기 준비' : '');
  }
  function speakNext(run, selectedVoice) {
    if (run !== generation || !playing) return;
    if (index >= segments.length) {
      if (loopEnabled && segments.length) {
        index = 0;
        display('반복듣기 · 본문을 처음부터 다시 읽습니다.');
        if (typeof win.setTimeout === 'function') {
          nextTimer = win.setTimeout(() => {
            nextTimer = null;
            speakNext(run, selectedVoice);
          }, 450);
        } else speakNext(run, selectedVoice);
        return;
      }
      playing = false;
      paused = false;
      display('본문 듣기가 끝났습니다.');
      return;
    }
    const utterance = new Utterance(segments[index]);
    utterance.lang = 'ko-KR';
    utterance.rate = Number(speed.value) || 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onend = () => {
      if (run !== generation) return;
      index += 1;
      const next = segments[index] || '';
      const previous = segments[index - 1] || '';
      // Gentle breathing pause between phrases; slightly longer after headings.
      const delay = /^(성경 본문|말씀 묵상|적용 질문|오늘의 실천|함께 드리는 기도)/.test(previous) ? 280 : 140;
      if (typeof win.setTimeout === 'function') nextTimer = win.setTimeout(() => {
        nextTimer = null; speakNext(run, selectedVoice);
      }, next ? delay : 0);
      else speakNext(run, selectedVoice);
    };
    utterance.onerror = event => {
      if (run !== generation) return;
      playing = false;
      paused = false;
      display('음성 재생이 중단되었습니다. 다시듣기를 눌러 주세요.');
    };
    display(`본문 듣는 중 · ${index + 1}/${segments.length}`);
    try { synth.speak(utterance); }
    catch { playing = false; paused = false; display('음성 재생을 시작할 수 없습니다.'); }
  }
  function start() {
    if(officialSelection){
      if(!data?.found||!officialSelection.url)return;
      try{
        win.open?.(officialSelection.url,'_blank','noopener,noreferrer');
        display('공식 '+officialSelection.label+' 페이지를 새 창으로 요청했습니다. 창이 열리지 않으면 위의 공식 사이트 링크를 이용하세요.');
      }catch{display('공식 사이트 링크를 눌러 주세요.');}
      return;
    }
    if (!data?.found || (!supported && !(engine.value === 'ekodi' && ekodi.ready))) return;
    stop();
    refreshVoices();
    if (engine.value === 'ekodi') {
      if (!ekodi.ready) { display('에코디 낭독음원 준비 중 · 기기 음성을 선택해 주세요.'); return; }
      const selectedGender = gender.value === 'female' ? 'female' : 'male';
      playing = true; paused = false;
      display('에코디 ' + (selectedGender === 'male' ? '남성' : '여성') + ' 낭독 시작 중');
      void ekodi.play(selectedGender, Number(speed.value) || 1).then(ok=>{
        if (!ok) {playing=false;display(ekodi.status);}
      });
      return;
    }
    const choices = koreanVoices(getVoices());
    // A gender is never approximated by changing pitch of an unknown voice.
    if (choices.length && gender.value !== 'auto' && !voice.value &&
        !chooseKoreanVoice(choices, gender.value)) {
      display(describeChoice());
      return;
    }
    if (voice.value && !chooseKoreanVoice(choices, 'auto', voice.value)) {
      display('선택했던 기기 음성을 찾을 수 없습니다. 다른 음성을 선택해 주세요.');
      return;
    }
    const selectedVoice = chooseKoreanVoice(choices, gender.value, voice.value);
    if (!selectedVoice && gender.value !== 'auto') {
      display('선택한 성별의 한국어 음성이 없습니다. 자동을 선택해 주세요.');
      return;
    }
    segments = devotionSpeechSegments(data);
    if (!segments.length) { display('읽을 본문이 없습니다.'); return; }
    playing = true;
    const run = ++generation;
    speakNext(run, selectedVoice);
  }

  readPreference();
  if (supported) {
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refreshVoices);
    }
    refreshVoices();
  }
  play.addEventListener('click', start);
  repeat.addEventListener('click', start);
  pause.addEventListener('click', () => {
    if (!playing) return;
    if (engine.value === 'ekodi') {
      if (paused) {void ekodi.resume(); paused = false;}
      else {ekodi.pause(); paused = true;}
      display(paused ? '에코디 낭독 일시정지' : '에코디 낭독 재생 중');
      return;
    }
    if (!supported) return;
    if (paused) { synth.resume(); paused = false; }
    else { synth.pause(); paused = true; }
    display(paused ? '일시정지됨' : `본문 듣는 중 · ${index + 1}/${segments.length}`);
  });
  stopButton.addEventListener('click', () => {
    loopEnabled = false;
    updateLoopButton();
    stop();
  });
  loopButton.addEventListener('click', () => {
    if (loopButton.disabled || officialSelection) return;
    loopEnabled = !loopEnabled;
    updateLoopButton();
    display(loopEnabled
      ? '반복듣기 켜짐 · 본문이 끝나면 자동으로 다시 시작합니다.'
      : playing ? '반복듣기 꺼짐 · 현재 본문까지만 읽습니다.' : describeChoice());
  });
  gender.addEventListener('change', () => {
    stop(); voice.value = ''; preferredVoice = ''; savePreference();
    if (engine.value === 'ekodi') display('에코디 '+(gender.value==='female'?'여성':'남성')+' 낭독 선택');
    else display(describeChoice());
  });
  voice.addEventListener('change', () => {
    stop();
    preferredVoice = voice.value;
    const selected = chooseKoreanVoice(getVoices(), 'auto', voice.value);
    const known = knownKoreanVoiceGender(selected);
    gender.value = known || 'auto';
    savePreference();
    display(describeChoice());
  });
  speed.addEventListener('change', () => {
    ekodi.setSpeed(Number(speed.value));
    savePreference();
    if (!playing) display(describeChoice());
  });
  engine.addEventListener('change',()=>{
    stop();
    if (engine.value === 'ekodi') {
      voiceLabel.hidden = true;
      if (gender.value === 'auto') gender.value = 'male';
      display(ekodi.ready ? '에코디 낭독음성 선택 완료' : '에코디 음원 준비 중');
    } else {
      voiceLabel.hidden = false;
      // The device may have no gender-identifiable Korean voice. Do not let
      // switching from EKODI's true female/male audio block fallback playback.
      if (!chooseKoreanVoice(getVoices(),gender.value)) gender.value = 'auto';
      display(describeChoice());
    }
  });
  ekodi.onStatus((message, ready) => {
    ekodiOption.disabled = !ready;
    ekodiOption.textContent = ready ? '에코디 AI 낭독 · 남성/여성' : '에코디 낭독 · 준비 중';
    if (engine.value === 'ekodi') {
      if (/끝났습니다|재생할 수 없습니다|차단됐습니다/.test(message)) {
        playing = false; paused = false;
      }
      if (data?.found) display(message);
    } else if (data?.found && !playing) {
      display(ready ? '에코디 낭독음원이 준비되었습니다. 낭독 방식에서 에코디를 선택하세요.' : message);
    }
  });
  win.addEventListener('pagehide', stop);
  display('');
  return {
    element: row,
    setData(next) {
      stop();
      officialSelection=null;
      loopEnabled = false;
      updateLoopButton();
      data = next?.found ? next : null;
      row.hidden = !data;
      if (!data) void ekodi.load('');
      if (data) {
        refreshVoices();
        // The approved-mp3 state is checked for the currently published date.
        // A pending date never exposes another day's audio or private voice files.
        void ekodi.load(data.date).then(ready => {
          if (!ready && !supported) display('현재 이 기기에서는 듣기를 사용할 수 없습니다.');
        });
        if (!supported) display('에코디 낭독음원을 확인하고 있습니다.');
        else display(describeChoice());
      }
    },
    setOfficialListening(next) {
      stop();
      officialSelection=next ? {
        label:String(next.label||'번역본'),
        url:isApprovedOfficialBibleHost(next.url)?next.url:null,
      }:null;
      if (officialSelection) {
        loopEnabled = false;
        updateLoopButton();
      }
      display(officialSelection?officialSelection.label+'은 공식 제공처에서 읽고 듣습니다.':'');
    },
    stop,
  };
}
