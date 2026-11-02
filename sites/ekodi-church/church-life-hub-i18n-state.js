(() => {
  'use strict';

  if (window.__EKODI_CHURCH_SOURCE_STATE__) return;
  window.__EKODI_CHURCH_SOURCE_STATE__ = true;

  const HANGUL = /[가-힣]/;
  const textSource = new WeakMap();
  const attrSource = new WeakMap();
  const trackedText = new Set();
  const trackedElements = new Set();

  const LIVE_COPY = {
    'ko-KR': { aria: '에코디교회 실시간 방송', title: '예배와 모임을 홈페이지에서 바로 방송하고 참여하세요.', detail: '카메라·마이크·PPT/화면공유·참여자·녹화·다국어 통역을 하나의 Live Room에서 연결합니다.', host: '방송하기', join: '참여하기' },
    en: { aria: 'EKODI Church live broadcast', title: 'Broadcast and join worship and gatherings directly from the church website.', detail: 'Connect camera, microphone, PPT or screen sharing, participants, recording, and multilingual interpretation in one Live Room.', host: 'Start broadcast', join: 'Join live' },
    'zh-CN': { aria: 'EKODI教会实时直播', title: '直接从教会网站直播并参加礼拜和聚会。', detail: '在一个 Live Room 中连接摄像头、麦克风、PPT/屏幕共享、参与者、录制和多语言口译。', host: '开始直播', join: '参与直播' },
    ja: { aria: 'EKODI教会ライブ配信', title: '教会ホームページから礼拝や集会をそのまま配信・参加できます。', detail: 'カメラ、マイク、PPT/画面共有、参加者、録画、多言語通訳を一つの Live Room でつなぎます。', host: '配信する', join: '参加する' },
    my: { aria: 'EKODI အသင်းတော် တိုက်ရိုက်ထုတ်လွှင့်မှု', title: 'အသင်းတော်ဝဘ်ဆိုက်မှ ဝတ်ပြုခြင်းနှင့် စုဝေးခြင်းများကို တိုက်ရိုက်ထုတ်လွှင့်ပြီး ပါဝင်နိုင်ပါသည်။', detail: 'ကင်မရာ၊ မိုက်ခရိုဖုန်း၊ PPT/မျက်နှာပြင်မျှဝေမှု၊ ပါဝင်သူများ၊ မှတ်တမ်းတင်ခြင်းနှင့် ဘာသာစကားစုံ စကားပြန်ကို Live Room တစ်ခုတည်းတွင် ချိတ်ဆက်ပါ။', host: 'ထုတ်လွှင့်ရန်', join: 'ပါဝင်ရန်' },
    kac: { aria: 'EKODI Nawku Htingnu live broadcast', title: 'Nawku htingnu website kaw nna worship hte meeting ni hpe live broadcast galaw nna shang lawm lu ai.', detail: 'Camera, microphone, PPT/screen sharing, participants, recording hte multilingual interpretation hpe Live Room langai hta mahkrai matut ya ai.', host: 'Broadcast galaw', join: 'Shang lawm' },
    vi: { aria: 'Phát trực tiếp Hội thánh EKODI', title: 'Phát và tham gia buổi thờ phượng, nhóm họp ngay trên trang web của hội thánh.', detail: 'Kết nối camera, micro, PPT/chia sẻ màn hình, người tham gia, ghi hình và phiên dịch đa ngôn ngữ trong một Live Room.', host: 'Phát trực tiếp', join: 'Tham gia' },
    mn: { aria: 'EKODI Сүмийн шууд дамжуулалт', title: 'Сүмийн вэбсайтаас мөргөл, цуглааныг шууд дамжуулж, оролцоорой.', detail: 'Камер, микрофон, PPT/дэлгэц хуваалцах, оролцогчид, бичлэг, олон хэлний орчуулгыг нэг Live Room-д холбоно.', host: 'Шууд дамжуулах', join: 'Оролцох' },
    id: { aria: 'Siaran langsung Gereja EKODI', title: 'Siarkan dan ikuti ibadah serta pertemuan langsung dari situs gereja.', detail: 'Hubungkan kamera, mikrofon, PPT/berbagi layar, peserta, rekaman, dan penerjemahan multibahasa dalam satu Live Room.', host: 'Mulai siaran', join: 'Ikuti siaran' },
  };

  function captureText(node) {
    const raw = node.nodeValue || '';
    if (!HANGUL.test(raw) || textSource.has(node)) return;
    textSource.set(node, raw);
    trackedText.add(node);
  }

  function captureAttr(element, name) {
    const raw = element.getAttribute(name);
    if (!raw || !HANGUL.test(raw)) return;
    let map = attrSource.get(element);
    if (!map) {
      map = new Map();
      attrSource.set(element, map);
      trackedElements.add(element);
    }
    if (!map.has(name)) map.set(name, raw);
  }

  function capture(root = document.body || document.documentElement) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style,template,noscript,[data-ekodi-language-control]')) continue;
      captureText(node);
    }
    root.querySelectorAll?.('[aria-label],[title],[placeholder]').forEach((element) => {
      captureAttr(element, 'aria-label');
      captureAttr(element, 'title');
      captureAttr(element, 'placeholder');
    });
  }

  function restore() {
    trackedText.forEach((node) => {
      const source = textSource.get(node);
      if (typeof source === 'string' && node.isConnected && node.nodeValue !== source) node.nodeValue = source;
    });
    trackedElements.forEach((element) => {
      const map = attrSource.get(element);
      if (!map || !element.isConnected) return;
      map.forEach((source, name) => {
        if (element.getAttribute(name) !== source) element.setAttribute(name, source);
      });
    });
  }

  function isKorean(value) { return value === 'ko' || value === 'ko-KR'; }
  function normalizeLocale(value) {
    const locale = String(value || '').trim();
    if (isKorean(locale)) return 'ko-KR';
    return LIVE_COPY[locale] ? locale : 'ko-KR';
  }
  function applyLiveEntryLocale(value) {
    const root = document.querySelector('[data-ekodi-church-live-entry]');
    if (!root) return;
    const copy = LIVE_COPY[normalizeLocale(value)];
    root.setAttribute('aria-label', copy.aria);
    const title = root.querySelector('strong');
    const detail = root.querySelector('small');
    const host = root.querySelector('.church-live-host');
    const join = root.querySelector('.church-live-join');
    if (title) title.textContent = copy.title;
    if (detail) detail.textContent = copy.detail;
    if (host) host.textContent = copy.host;
    if (join) join.textContent = copy.join;
  }
  function applyAfterLocale(locale) {
    if (isKorean(locale)) requestAnimationFrame(restore);
    requestAnimationFrame(() => applyLiveEntryLocale(locale));
  }

  window.EKODIChurchSourceState = Object.freeze({ capture, restore });
  capture();
  document.addEventListener('DOMContentLoaded', () => {
    capture();
    applyLiveEntryLocale(document.documentElement.lang);
  }, { once: true });
  window.addEventListener('ekodi:locale-change', (event) => applyAfterLocale(event.detail?.locale));
  window.addEventListener('ekodi:church-i18n-applied', (event) => applyAfterLocale(event.detail?.locale));
  window.addEventListener('ekodi:church-extended-i18n-applied', (event) => applyAfterLocale(event.detail?.locale));

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) captureText(node);
          else if (node.nodeType === Node.ELEMENT_NODE) capture(node);
        });
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
