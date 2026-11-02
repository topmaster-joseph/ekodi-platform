// BOOKS-HOME-MEMBER-20261102 — 첫 화면 회원 표시와 공용 로그아웃을 연결한다.
// 실제 인증/권한 판정은 EKODI Books Commerce 서버가 수행한다.
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;

  function accountLabel(data) {
    const name = String(data?.displayName || data?.name || '').trim();
    if (name && !name.includes('@') && name.length <= 30) return name;
    const email = String(data?.email || '').trim();
    const alias = /^identity\+([a-z][a-z0-9_-]*)\.[a-z0-9]+@ekodi\.kr$/i.exec(email);
    if (alias) {
      const provider = { kakao: '카카오', naver: '네이버', daum: '다음', google: '구글', apple: 'Apple' }[alias[1].toLowerCase()];
      return (provider || '연결') + ' 계정';
    }
    const local = email.includes('@') ? email.split('@')[0] : '';
    return local ? (local.length > 20 ? local.slice(0, 19) + '…' : local) + '님' : '회원님';
  }

  async function init() {
    const actions = document.querySelector('.ekc-header[data-ekodi-chrome="books"] .ekc-actions');
    if (!actions || !C?.session || !C?.api || !C?.signOut) return;
    const current = await C.session().catch(() => null);
    if (!current?.accessToken) return;
    // 저장소의 오래된 토큰만으로 로그인 표시를 하지 않는다. 서버 인증 완료 뒤 보여 준다.
    const profile = await C.api('library').catch(() => null);
    if (!profile) return;

    const control = document.createElement('div');
    control.className = 'ekc-account';
    control.setAttribute('aria-label', '내 계정');
    const member = document.createElement('span');
    member.className = 'ekc-account-name';
    member.textContent = accountLabel(profile);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ekc-account-logout';
    button.textContent = '로그아웃';
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = '로그아웃 중';
      try {
        await C.signOut();
        window.location.reload();
      } catch {
        button.disabled = false;
        button.textContent = '로그아웃';
      }
    });
    control.append(member, button);
    actions.insertBefore(control, actions.querySelector('.ekc-menu'));
  }
  init();
})();
