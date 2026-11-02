import { devotionSpeechSegments } from './devotion-share-audio.js';

// On-device/browser speech synthesis. Playback is never automatic.
export function createDevotionSpeechUI(win = window, doc = document) {
  const row = doc.createElement('section');
  row.className = 'dv-speech-tools';
  row.hidden = true;
  row.setAttribute('aria-label', '매일묵상 본문 듣기');

  const button = (name, label) => {
    const el = doc.createElement('button');
    el.type = 'button';
    el.className = 'dv-btn dv-speech-btn';
    el.dataset.speechAction = name;
    el.textContent = label;
    return el;
  };
  const play = button('play', '본문 듣기');
  const pause = button('pause', '일시정지');
  const repeat = button('repeat', '다시듣기');
  const stopButton = button('stop', '정지');
  const label = doc.createElement('label');
  label.className = 'dv-speech-speed';
  label.textContent = '속도 ';
  const speed = doc.createElement('select');
  speed.setAttribute('aria-label', '읽기 속도');
  for (const [value, name] of [['0.8','느리게'],['1','보통'],['1.2','빠르게']]) {
    const opt = doc.createElement('option');
    opt.value = value;
    opt.textContent = name;
    speed.append(opt);
  }
  speed.value = '1';
  label.append(speed);
  const status = doc.createElement('span');
  status.className = 'dv-speech-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  row.append(play, pause, repeat, stopButton, label, status);

  const synth = win.speechSynthesis;
  const Utterance = win.SpeechSynthesisUtterance;
  const supported = Boolean(synth && Utterance && typeof synth.speak === 'function');
  let data = null;
  let generation = 0;
  let segments = [];
  let index = 0;
  let playing = false;
  let paused = false;

  function display(message) {
    status.textContent = message;
    play.disabled = !supported || !data?.found || playing;
    pause.disabled = !playing;
    repeat.disabled = !supported || !data?.found;
    stopButton.disabled = !playing;
    pause.textContent = paused ? '계속 듣기' : '일시정지';
  }

  function stop() {
    ++generation;
    playing = false;
    paused = false;
    segments = [];
    index = 0;
    if (supported) synth.cancel();
    display(data?.found ? '듣기 준비' : '');
  }

  function speakNext(run) {
    if (run !== generation || !playing) return;
    if (index >= segments.length) {
      playing = false;
      paused = false;
      display('본문 듣기가 끝났습니다.');
      return;
    }
    const utterance = new Utterance(segments[index]);
    utterance.lang = 'ko-KR';
    utterance.rate = Number(speed.value) || 1;
    try {
      const voices = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
      const korean = voices.find(v => /^ko(?:-|$)/i.test(v.lang));
      if (korean) utterance.voice = korean;
    } catch {}
    utterance.onend = () => {
      if (run !== generation) return;
      index += 1;
      speakNext(run);
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
    if (!supported || !data?.found) return;
    stop();
    segments = devotionSpeechSegments(data);
    if (!segments.length) { display('읽을 본문이 없습니다.'); return; }
    playing = true;
    const run = ++generation;
    // First speak() happens directly in the user's click handler.
    speakNext(run);
  }
  play.addEventListener('click', start);
  repeat.addEventListener('click', start);
  pause.addEventListener('click', () => {
    if (!supported || !playing) return;
    if (paused) { synth.resume(); paused = false; }
    else { synth.pause(); paused = true; }
    display(paused ? '일시정지됨' : `본문 듣는 중 · ${index + 1}/${segments.length}`);
  });
  stopButton.addEventListener('click', stop);
  win.addEventListener('pagehide', stop);
  display('');
  return {
    element: row,
    setData(next) {
      stop();
      data = next?.found ? next : null;
      row.hidden = !data;
      if (!supported && data) {
        display('이 기기에서는 본문 듣기를 지원하지 않습니다.');
      } else if (data) display('듣기 준비');
    },
    stop,
  };
}
