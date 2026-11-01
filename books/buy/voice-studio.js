// EKODI-VOICE-001: 에코디 낭독 음성 녹음실(운영자 전용).
// 운영자 본인이 아래 원고를 읽어 녹음하면 비공개 보관함에 저장되고, EKODI Voice 렌더링이
// 이 음색으로 모든 출판 도서의 장별 무료 오디오북 초안을 만든다. 초안은 사람이 듣고 승인하기 전까지 공개되지 않는다.
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const host = document.getElementById('voiceStudio');
  if (!C || !host) return;
  const SCRIPT = [
    '저는 ○○○입니다. 이 녹음은 제 목소리이며, 출판 도서의 무료 오디오북을 만드는 데 제 음성을 쓰는 것에 동의합니다.',
    '책은 조용한 대화입니다. 한 사람이 오래 생각한 것을 다른 사람이 천천히 따라 걷는 길입니다. 오늘 우리는 그 길 위에서, 빠름보다 깊음을, 많음보다 바름을 묻습니다.',
    '하나, 둘, 셋. 이천이십육 년 십일 월 이 일. 전라남도 무안군 청계면. 사과와 배, 바다와 바람, 햇빛과 그늘.',
    '왜 사람은 더 편해졌는데 더 불안해질까요? 정말 그럴까요? 그렇다면 우리는 무엇을 붙들어야 할까요!',
    '"괜찮아요." 그는 낮게 말했습니다. "천천히 가도 됩니다. 중요한 것은 방향이니까요."',
    '기술은 증폭기처럼 작동합니다. 내 안의 힘도 키우고, 내 안의 빈틈도 키웁니다. 그래서 기능보다 중심이 더 중요합니다.',
    '시편은 하나님 앞에서 고요히 쉬는 마음을 말하고, 잠언은 급한 걸음보다 지혜로운 분별을 말합니다.',
    'In Search of the EKODIan. Faith, scholarship, and community — read slowly, together.',
  ];
  const el = (t, p = {}, ...k) => { const n = document.createElement(t); Object.assign(n, p); n.append(...k); return n; };
  let gender = 'm', speakerName = () => '';
  async function api(method, body, headers = {}) {
    const s = await C.session();
    const r = await fetch(`${C.BASE}/api/commerce/admin/voice/sample?gender=${gender}`, { method, body, headers: { authorization: 'Bearer ' + (s?.accessToken || ''), ...headers }, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || '처리하지 못했습니다.'), { status: r.status });
    return d;
  }
  async function upload(blob, msg) {
    msg.textContent = '올리는 중…';
    try {
      const d = await api('PUT', blob, { 'content-type': blob.type || 'application/octet-stream', 'x-ekodi-voice-consent': 'self-recorded-for-ekodi-audiobooks', 'x-ekodi-voice-speaker': encodeURIComponent(speakerName()) });
      msg.textContent = `저장했습니다 (${Math.round(d.size / 1024)}KB · ${d.format}). 이 음성으로 오디오북 초안을 만들 수 있습니다.`;
    } catch (e) { msg.textContent = e.message; }
  }
  async function render() {
    let state;
    try { state = await api('GET'); } catch { return; } // 운영자가 아니면 표시하지 않는다
    host.hidden = false;
    const saved = g => state[g]?.present ? `${g === 'm' ? '남성' : '여성'} 녹음: ${state[g].speaker || ''} ${String(state[g].recordedAt).slice(0, 16).replace('T', ' ')}` : `${g === 'm' ? '남성' : '여성'} 녹음: 아직 없음`;
    const msg = el('p', { className: 'buy-msg', role: 'status', textContent: `${saved('m')} · ${saved('f')}` });
    // 남·여 원 녹음 두 개면 어린이·청소년·중장년·노년 목소리로 변환해 장별로 저장한다.
    const pickM = el('input', { type: 'radio', name: 'voiceGender', value: 'm', checked: true }), pickF = el('input', { type: 'radio', name: 'voiceGender', value: 'f' });
    for (const r of [pickM, pickF]) r.addEventListener('change', () => { gender = r.value; });
    const nameInput = el('input', { type: 'text', maxLength: 40, placeholder: '읽는 사람 이름 (예: 정찬균)', className: 'voice-name' });
    speakerName = () => nameInput.value.trim();
    const consent = el('input', { type: 'checkbox', id: 'voiceConsent' });
    const rec = el('button', { type: 'button', className: 'primary', textContent: '● 녹음 시작' });
    const file = el('input', { type: 'file', accept: 'audio/*,.wav,.m4a,.mp3,.webm' });
    const player = el('audio', { controls: true, hidden: true });
    let mr = null, chunks = [], started = 0, timer = 0;
    rec.addEventListener('click', async () => {
      if (!consent.checked || !nameInput.value.trim()) { msg.textContent = '읽는 사람 이름을 적고 본인 녹음·사용 동의에 체크해 주세요.'; return; }
      if (mr && mr.state === 'recording') { mr.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
        chunks = []; mr = new MediaRecorder(stream);
        mr.ondataavailable = e => e.data.size && chunks.push(e.data);
        mr.onstop = () => {
          clearInterval(timer); stream.getTracks().forEach(t => t.stop()); rec.textContent = '● 다시 녹음';
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          if ((Date.now() - started) < 60000) { msg.textContent = '1분 이상 읽어 주세요(원고 전체 권장, 약 2~3분).'; return; }
          player.src = URL.createObjectURL(blob); player.hidden = false;
          const save = el('button', { type: 'button', className: 'primary', textContent: '이 녹음 저장' });
          save.addEventListener('click', () => upload(blob, msg), { once: true });
          msg.replaceChildren('들어 보고 괜찮으면 저장해 주세요. ', save);
        };
        mr.start(); started = Date.now(); rec.textContent = '■ 녹음 끝내기';
        timer = setInterval(() => { msg.textContent = `녹음 중 ${Math.floor((Date.now() - started) / 1000)}초 — 원고를 천천히, 평소 설교·강의하듯 읽어 주세요.`; }, 500);
      } catch { msg.textContent = '마이크를 쓸 수 없습니다. 아래에서 휴대폰 녹음 파일을 올려 주세요.'; }
    });
    file.addEventListener('change', () => { const f = file.files?.[0]; if (!f) return; if (!consent.checked || !nameInput.value.trim()) { msg.textContent = '읽는 사람 이름을 적고 본인 녹음·사용 동의에 체크해 주세요.'; return; } upload(f, msg); });
    host.replaceChildren(
      el('h2', { textContent: '에코디 낭독 음성 (EKODI Voice)' }),
      el('p', { textContent: '남성 한 분, 여성 한 분이 각각 아래 원고를 2~3분 읽어 주세요. 두 녹음으로 어린이·청소년·중장년·노년 목소리(남·여 8가지)를 만들어 장별로 저장하고, 독자는 목소리와 속도를 골라 듣습니다. 사람이 듣고 승인하기 전까지는 공개하지 않습니다.' }),
      el('div', { className: 'voice-gender' }, el('label', {}, pickM, ' 남성 목소리 녹음'), el('label', {}, pickF, ' 여성 목소리 녹음')), nameInput,
      el('ol', { className: 'voice-script' }, ...SCRIPT.map(t => el('li', { textContent: t }))),
      el('label', { className: 'voice-consent' }, consent, ' 이 녹음은 위에 적은 사람 본인의 목소리이며, 본인이 에코디 오디오북 제작에 쓰는 것에 동의합니다.'),
      el('div', { className: 'review-actions' }, rec, el('label', { className: 'voice-file' }, '또는 녹음 파일 올리기 ', file)),
      player, msg,
    );
  }
  render();
})();
