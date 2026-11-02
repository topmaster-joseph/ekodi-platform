(() => {
  'use strict';

  const STORAGE_KEY = 'ekodi.church.life.v1';
  const MAX_MEMORIES = 6;

  const emptyState = () => ({
    reflection: { word: '', interpretation: '', step: '', updatedAt: '' },
    presence: '',
    memories: [],
    witness: { place: '', action: '', updatedAt: '' }
  });

  const safeParse = (value) => {
    try { return JSON.parse(value); } catch { return null; }
  };

  const loadState = () => {
    try {
      const stored = safeParse(localStorage.getItem(STORAGE_KEY));
      return stored && typeof stored === 'object' ? { ...emptyState(), ...stored } : emptyState();
    } catch {
      return emptyState();
    }
  };

  const saveState = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  };

  const formatNow = () => new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date());

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = loadState();

  const setStatus = (message) => {
    const el = q('#life-status');
    if (!el) return;
    el.textContent = message;
    window.clearTimeout(setStatus.timer);
    setStatus.timer = window.setTimeout(() => { el.textContent = ''; }, 3200);
  };

  const buildShareText = () => {
    const lines = ['에코디교회 · 말씀으로 오늘을 살아내기'];
    if (state.reflection.word) lines.push(`말씀: ${state.reflection.word}`);
    if (state.reflection.interpretation) lines.push(`삶의 해석: ${state.reflection.interpretation}`);
    if (state.reflection.step) lines.push(`오늘의 한 걸음: ${state.reflection.step}`);
    if (state.witness.action) lines.push(`복음의 증언: ${state.witness.action}`);
    return lines.join('\n');
  };

  const shareText = async (text, title = '에코디교회 공동체 나눔') => {
    if (!text.trim()) {
      setStatus('먼저 나눌 내용을 기록해 주세요.');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        setStatus('나눔 창을 열었습니다.');
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus('공유할 내용을 복사했습니다.');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      setStatus('공유를 열지 못했습니다. 내용을 복사해 사용해 주세요.');
    }
  };

  const renderReflection = () => {
    const form = q('#life-reflection-form');
    if (!form) return;
    form.elements.word.value = state.reflection.word || '';
    form.elements.interpretation.value = state.reflection.interpretation || '';
    form.elements.step.value = state.reflection.step || '';

    const record = q('#reflection-record');
    if (!record) return;
    if (!state.reflection.interpretation && !state.reflection.step) {
      record.className = 'life-record empty';
      record.textContent = '아직 오늘의 기록이 없습니다. 말씀 한 구절이 하루의 방향을 바꾸는 작은 문이 될 수 있습니다.';
      return;
    }
    record.className = 'life-record';
    record.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = state.reflection.updatedAt || '오늘의 기록';
    const body = document.createElement('p');
    body.textContent = [state.reflection.interpretation, state.reflection.step ? `→ ${state.reflection.step}` : ''].filter(Boolean).join('\n');
    record.append(title, body);
  };

  const renderPresence = () => {
    qa('.presence-button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.presence === state.presence));
    });
  };

  const renderMemories = () => {
    const feed = q('#memory-feed');
    if (!feed) return;
    feed.replaceChildren();
    if (!state.memories.length) {
      const empty = document.createElement('div');
      empty.className = 'life-record empty';
      empty.textContent = '함께 웃었던 일, 감사했던 순간, 기도 응답을 한 줄씩 남겨 보세요.';
      feed.append(empty);
      return;
    }
    state.memories.slice(0, 3).forEach((memory) => {
      const item = document.createElement('article');
      item.className = 'memory-item';
      const time = document.createElement('time');
      time.textContent = memory.createdAt;
      const title = document.createElement('strong');
      title.textContent = memory.title || '우리의 기억';
      const body = document.createElement('p');
      body.textContent = memory.body;
      const share = document.createElement('button');
      share.type = 'button';
      share.className = 'life-action secondary';
      share.textContent = '이 추억 나누기';
      share.addEventListener('click', () => shareText(`${memory.title || '우리의 기억'}\n${memory.body}`, '에코디교회 추억 나눔'));
      item.append(time, title, body, share);
      feed.append(item);
    });
  };

  const renderWitness = () => {
    const form = q('#witness-form');
    if (!form) return;
    form.elements.place.value = state.witness.place || '';
    form.elements.action.value = state.witness.action || '';
    const record = q('#witness-record');
    if (!record) return;
    if (!state.witness.action) {
      record.className = 'life-record empty';
      record.textContent = '가정, 일터, 학교, 골목, 온라인. 오늘 내가 복음의 증인으로 서게 될 자리를 적어 보세요.';
      return;
    }
    record.className = 'life-record';
    record.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = state.witness.place ? `${state.witness.place}에서` : (state.witness.updatedAt || '오늘');
    const body = document.createElement('p');
    body.textContent = state.witness.action;
    record.append(title, body);
  };

  const bindReflection = () => {
    const form = q('#life-reflection-form');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.reflection = {
        word: form.elements.word.value.trim(),
        interpretation: form.elements.interpretation.value.trim(),
        step: form.elements.step.value.trim(),
        updatedAt: formatNow()
      };
      const ok = saveState(state);
      renderReflection();
      setStatus(ok ? '오늘의 말씀 기록을 이 기기에 저장했습니다.' : '이 브라우저에서는 저장할 수 없습니다.');
    });
    q('#share-reflection')?.addEventListener('click', () => shareText(buildShareText()));
  };

  const bindPresence = () => {
    qa('.presence-button').forEach((button) => {
      button.addEventListener('click', () => {
        state.presence = button.dataset.presence || '';
        saveState(state);
        renderPresence();
        setStatus(`${button.querySelector('strong')?.textContent || '오늘의 안부'} 상태를 저장했습니다.`);
      });
    });
    q('#share-presence')?.addEventListener('click', () => {
      const active = qa('.presence-button').find((button) => button.dataset.presence === state.presence);
      const label = active?.querySelector('strong')?.textContent || '';
      const detail = active?.querySelector('small')?.textContent || '';
      shareText([label, detail].filter(Boolean).join('\n'), '에코디교회 · 오늘의 안부');
    });
  };

  const bindMemory = () => {
    const form = q('#memory-form');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = form.elements.body.value.trim();
      if (!body) return;
      state.memories.unshift({
        id: `${Date.now()}`,
        title: form.elements.title.value.trim(),
        body,
        createdAt: formatNow()
      });
      state.memories = state.memories.slice(0, MAX_MEMORIES);
      saveState(state);
      form.reset();
      renderMemories();
      setStatus('추억을 이 기기에 담았습니다. 원할 때만 나눌 수 있습니다.');
    });
  };

  const bindWitness = () => {
    const form = q('#witness-form');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.witness = {
        place: form.elements.place.value.trim(),
        action: form.elements.action.value.trim(),
        updatedAt: formatNow()
      };
      saveState(state);
      renderWitness();
      setStatus('오늘의 증언을 기록했습니다.');
    });
    q('#share-witness')?.addEventListener('click', () => {
      const text = [state.witness.place, state.witness.action].filter(Boolean).join('\n');
      shareText(text, '에코디교회 · 오늘의 증언');
    });
  };

  const bindReset = () => {
    q('#life-reset')?.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      Object.assign(state, emptyState());
      renderReflection();
      renderPresence();
      renderMemories();
      renderWitness();
      setStatus('이 기기에 저장된 공동체 생활 기록을 비웠습니다.');
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderReflection();
    renderPresence();
    renderMemories();
    renderWitness();
    bindReflection();
    bindPresence();
    bindMemory();
    bindWitness();
    bindReset();
  });
})();
