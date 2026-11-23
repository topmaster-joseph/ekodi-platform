// EKODI approved human-reviewed prerecorded devotional narration.
// No paid API, device gender heuristics, voice cloning or private book audio.
// Missing/unapproved audio remains unavailable; device TTS stays usable.
export function isNarrationDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function approvedNarration(manifest, date) {
  if (!isNarrationDate(date) || manifest?.date !== date ||
      manifest?.schema !== 'ekodi.devotion.narration.v1' ||
      manifest?.status !== 'approved' || manifest?.language !== 'ko-KR' ||
      manifest?.review?.rights !== true ||
      manifest?.review?.textIntegrity !== true ||
      manifest?.review?.voicePerformance !== true ||
      manifest?.review?.accessibility !== true) return null;
  // Licensed stock voices are distinguishable from private consented samples.
  // A claimed stock source cannot substitute arbitrary voice files or a
  // misleading model license in the published review manifest.
  const source = manifest?.source;
  if (source) {
    if (source.kind === 'licensed-stock-preset') {
      if (source.synthetic !== true || source.model !== 'supertonic-3' ||
          source.modelRevision !== '724fb5abbf5502583fb520898d45929e62f02c0b' ||
          source.modelLicense !== 'OpenRAIL-M' ||
          source.voices?.male !== 'M4' || source.voices?.female !== 'F5') return null;
    } else if (source.kind !== 'consented-speakers' || source.synthetic !== true) {
      return null;
    }
  }
  const files = {};
  for (const gender of ['male','female']) {
    const track = manifest?.tracks?.[gender];
    if (!track || track.file !== gender + '.mp3' ||
        track.status !== 'approved' ||
        !/^[a-f0-9]{64}$/i.test(track.sha256 || '') ||
        !(Number(track.durationSec) > 1 && Number(track.durationSec) < 3600)) return null;
    files[gender] = '/bible/narration/' + date + '/' + gender + '.mp3';
  }
  return Object.freeze(files);
}
export function narrationManifestUrl(date) {
  if (!isNarrationDate(date)) return null;
  return '/bible/narration/' + date + '/manifest.json';
}
export function createEkodiNarrationPlayer(win = window) {
  let manifest = null;
  let selectedDate = '';
  let generation = 0;
  let player = null;
  let loopEnabled = false;
  let listeners = new Set();
  let status = '에코디 남성·여성 낭독음원 준비 중';
  const fetchImpl = (...args) => win.fetch(...args);
  function inform(message) { status = message; for(const f of listeners) f(message,Boolean(manifest)); }
  function stop() {
    if (player) { try {player.pause();player.currentTime = 0;} catch {} player.onended = null;player.onerror = null;player = null; }
  }
  async function load(date) {
    const run = ++generation;
    stop(); manifest = null; selectedDate = date;
    const route = narrationManifestUrl(date);
    if (!route) { inform('날짜를 확인해 주세요.'); return false; }
    try {
      const response = await fetchImpl(route,{cache:'no-store',credentials:'omit'});
      if (run !== generation) return false;
      if (!response.ok) { inform('에코디 남성·여성 낭독음원 준비 중 · 기기 낭독 가능'); return false; }
      const json = await response.json();
      const approved = approvedNarration(json,date);
      if (!approved) { inform('검수가 완료된 에코디 낭독음원이 없습니다.'); return false; }
      // Mark ready only when both reviewed public tracks are truly deliverable.
      const checks = await Promise.all(Object.values(approved).map(async route => {
        try { const r = await fetchImpl(route,{method:'HEAD',cache:'no-store',credentials:'omit'});
          return r.ok && /audio\/(?:mpeg|mp3)/i.test(r.headers?.get('content-type') || 'audio/mpeg');
        } catch {return false;}
      }));
      if (run !== generation) return false;
      if (checks.some(ok=>!ok)) {inform('에코디 낭독 파일 검증 대기 · 기기 낭독 가능');return false;}
      manifest = approved;
      inform('에코디 낭독음성 남성·여성 선택 가능');
      return true;
    } catch {
      if (run === generation) inform('에코디 낭독음원 확인 실패 · 기기 낭독 가능');
      return false;
    }
  }
  async function play(gender='male', rate=1) {
    if (!manifest || (gender !== 'male' && gender !== 'female')) {
      inform('에코디 낭독음원이 아직 준비되지 않았습니다. 기기 낭독을 이용해 주세요.');
      return false;
    }
    stop();
    const url = manifest[gender];
    if (!url || !win.Audio) return false;
    const track = new win.Audio(url);
    player = track;
    track.preload = 'auto';
    track.playbackRate = Number(rate) || 1;
    track.loop = loopEnabled;
    track.onended = () => { if (player === track) {player=null;inform('에코디 낭독 듣기가 끝났습니다.');} };
    track.onerror = () => { if(player===track){player=null;inform('에코디 낭독음원을 재생할 수 없습니다. 기기 낭독을 이용해 주세요.');} };
    try {
      // This promise originates from a user click; never call automatically on load.
      await track.play();
      if (player === track) inform('에코디 ' + (gender === 'male' ? '남성' : '여성') + ' 낭독 재생 중');
      return true;
    } catch {
      if (player === track) {stop();inform('음성 재생이 차단됐습니다. 듣기를 다시 눌러 주세요.');}
      return false;
    }
  }
  function pause() { if(player) {player.pause();inform('에코디 낭독 일시정지');} }
  async function resume() { if(player) {try{await player.play();inform('에코디 낭독 다시 재생 중');return true;}catch{return false;}}return false; }
  function setSpeed(rate){if(player)player.playbackRate=Number(rate)||1;}
  function setLoop(enabled){loopEnabled=enabled===true;if(player)player.loop=loopEnabled;}
  return {
    load,play,pause,resume,stop,setSpeed,setLoop,
    get ready(){return Boolean(manifest);},
    get date(){return selectedDate;},
    get status(){return status;},
    onStatus(callback){listeners.add(callback);return ()=>listeners.delete(callback);}
  };
}
