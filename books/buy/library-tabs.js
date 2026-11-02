// BOOKS-LIBRARY-TABS-20261102 — 독자·운영자 영역은 서버 권한을 유지한 채 탭으로 표시한다.
(() => {
  'use strict';
  const heading = document.querySelector('.library-heading');
  const list = document.getElementById('libraryList');
  const operator = document.getElementById('operatorPanel');
  if (!heading || !list || !operator) return;

  const tabs = [
    ['books','보유 도서'], ['audio','오디오북'], ['orders','구매기록'],
    ['account','계정'], ['help','이용안내'], ['operator','운영자'],
  ];
  const nav = document.createElement('nav');
  nav.className = 'library-tabs';
  nav.setAttribute('aria-label', '내 서재 기능');
  nav.setAttribute('role', 'tablist');
  const buttons = {};
  const panels = {};
  for (const [key,label] of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-tab';
    button.id = 'libTab-' + key;
    button.setAttribute('role','tab');
    button.setAttribute('aria-controls','libPanel-' + key);
    button.textContent = label;
    if (key === 'operator') button.hidden = true;
    nav.append(button);
    buttons[key] = button;
    const panel = document.createElement('section');
    panel.className = 'library-tab-panel';
    panel.id = 'libPanel-' + key;
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',button.id);
    panel.tabIndex = 0;
    panels[key] = panel;
  }
  const audioList = document.createElement('div');audioList.className = 'library-audio-list';panels.audio.append(audioList);
  const orderList = document.createElement('div');orderList.className = 'library-orders-list';panels.orders.append(orderList);
  const accountList = document.createElement('div');accountList.className = 'library-account-view';panels.account.append(accountList);
  panels.books.append(list);
  panels.operator.append(operator);
  const related = document.querySelector('.library-related-links');
  const help = document.createElement('div');
  help.className = 'library-info-view';
  const helpTitle = document.createElement('h2');helpTitle.textContent = '책을 더 편하게 읽으세요';
  const helpCopy = document.createElement('p');helpCopy.textContent = '구매한 전자책은 보유 도서에서 바로 읽거나 EPUB 파일로 받을 수 있습니다. 오디오북은 검수·승인 후 제공되며 추가 결제는 없습니다.';
  help.append(helpTitle,helpCopy);
  if (related) help.append(related);
  panels.help.append(help);
  const note = document.getElementById('operatorNote');
  if (note) { note.hidden = true; note.textContent = ''; }
  heading.insertAdjacentElement('afterend',nav);
  // Tab panels follow the tab bar and keep stable DOM IDs.
  for (const [key] of tabs) nav.parentNode.append(panels[key]);
  const keys = tabs.map(item=>item[0]);

  function select(key, push = false, focus = false) {
    if (!panels[key] || buttons[key].hidden) key = 'books';
    for (const name of keys) {
      const chosen = key === name;
      panels[name].hidden = !chosen;
      buttons[name].tabIndex = chosen ? 0 : -1;
      buttons[name].setAttribute('aria-selected',String(chosen));
    }
    if (push) history.replaceState(null,'','#lib-' + key);
    if (focus) buttons[key].focus();
  }
  for (const [key] of tabs) {
    buttons[key].addEventListener('click',() => select(key,true));
    buttons[key].addEventListener('keydown',event => {
      const allowed = keys.filter(x=>!buttons[x].hidden);
      let index = allowed.indexOf(key);
      if (event.key === 'ArrowRight') index = (index + 1) % allowed.length;
      else if (event.key === 'ArrowLeft') index = (index + allowed.length - 1) % allowed.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = allowed.length - 1;
      else return;
      event.preventDefault();
      select(allowed[index],true,true);
    });
  }
  const initial = () => {
    const hash = location.hash.match(/^#lib-(books|audio|orders|account|help|operator)$/);
    return hash ? hash[1] : 'books';
  };
  window.addEventListener('hashchange',()=>{if(/^#lib-/.test(location.hash)) select(initial());});
  select(initial());

  function message(el,text) {
    const p = document.createElement('p');p.className = 'library-panel-empty';p.textContent = text;el.append(p);
  }
  function render(items, account) {
    const rows = [...list.querySelectorAll('.library-item')];
    audioList.replaceChildren();orderList.replaceChildren();accountList.replaceChildren();
    let foundAudio = 0;
    items.forEach((book,i) => {
      const row = rows[i];
      if (book.audiobook?.included && row) {
        foundAudio++;
        const card = document.createElement('article');card.className = 'library-compact-card';
        const title = document.createElement('h3');title.textContent = book.title;
        card.append(title);
        const extra = row.querySelector('.audio-bonus');
        if (extra) card.append(extra);
        const listen = [...row.querySelectorAll('.library-actions button')].find(btn=>btn.textContent==='오디오북 듣기');
        if (listen) card.append(listen);
        audioList.append(card);
      }
      const order = document.createElement('article');
      order.className = 'library-compact-card';
      const name = document.createElement('h3');name.textContent = book.title;
      const meta = document.createElement('p');
      const when = book.grantedAt && !Number.isNaN(new Date(book.grantedAt).getTime()) ? new Date(book.grantedAt).toLocaleDateString('ko-KR') : '일자 미상';
      const amount = Number(book.amount);
      meta.textContent = '서재 등록 ' + when + (Number.isFinite(amount) && amount >= 0 && book.amount != null ? ' · 결제 ' + amount.toLocaleString('ko-KR') + '원' : '');
      order.append(name,meta);
      if (book.receiptUrl) {
        try {
          const url = new URL(book.receiptUrl);
          if (url.protocol === 'https:') {
            const receipt = document.createElement('a');receipt.href = url.href;receipt.target='_blank';receipt.rel='noopener noreferrer';receipt.textContent='영수증 확인';order.append(receipt);
          }
        } catch {}
      }
      orderList.append(order);
    });
    if (!foundAudio) message(audioList,'이 계정에 제공 중이거나 준비 중인 오디오북이 없습니다.');
    if (!items.length) message(orderList,'아직 서재에 등록된 구매 도서가 없습니다.');
    const title = document.createElement('h2');title.textContent = '내 계정';
    const label = document.createElement('p');label.textContent = '로그인: ' + (account || '회원님');
    const copy = document.createElement('p');copy.textContent = '연결한 로그인 수단과 구매 권한은 EKODI 통합 인증에 따라 관리됩니다. 로그인 계정이 다르면 구매 도서가 다르게 보일 수 있습니다.';
    const link = document.createElement('a');link.href = 'https://ekodi.kr/books/';link.textContent='에코디서점으로 돌아가기';
    accountList.append(title,label,copy,link);
  }
  function showOperator() {
    buttons.operator.hidden = false;
    if (location.hash === '#lib-operator') select('operator');
  }
  window.EkodiLibraryTabs = {render,showOperator};
})();
