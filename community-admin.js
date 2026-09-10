(() => {
  'use strict';
  const content = document.querySelector('.content');
  if (!content || content.querySelector('[data-panel~="community"]')) return;

  const section = document.createElement('section');
  section.id = 'communityAdminSection';
  section.className = 'section community-admin hidden-panel';
  section.dataset.panel = 'community';
  section.hidden = true;
  section.innerHTML = `
    <div class="community-admin-head">
      <div>
        <p class="community-admin-kicker">COMMUNITY · SERVICE ADMIN</p>
        <h2>커뮤니티 서비스 관리</h2>
        <p>외부 사용자에게 제공되는 Community 서비스의 운영 원장은 이 서비스 관리자 화면입니다. 플랫폼 최고관리자는 여기에서 서비스 상태를 관찰하고, 필요한 경우에만 명시적인 플랫폼 권한으로 개입합니다.</p>
      </div>
      <a class="community-admin-link" href="https://community.ekodi.kr/" target="_blank" rel="noopener">Community 사용자 화면</a>
    </div>
    <div class="community-admin-grid">
      <article><small>PUBLIC PROVIDER</small><strong>Community</strong><span>사람 · 모임 · 참여 · 대화를 연결하는 외부 제공 주체</span></article>
      <article><small>REGISTERED SERVICE</small><strong>함께읽기</strong><span>등록 경로 · ekodi.kr/community/reading<br>내부 기능 · Reading &amp; Dialogue Engine</span></article>
      <article><small>BOOK CONTRACT</small><strong>에코디서점</strong><span>책 메타데이터와 카탈로그는 Books의 명시적 서비스 계약으로 연결</span></article>
      <article><small>LOCAL OPERATIONS</small><strong>Service / Site Admin</strong><span>교회 · 상인회 · 기관 · 단체 등 개별 운영공간은 해당 관리자 역할과 권한 범위에서 자기 모임을 관리</span></article>
      <article><small>PLATFORM OVERSIGHT</small><strong>Super Administrator</strong><span>Core · 인증 · 보안 · 감사 · 관찰 · 공통 가드레일을 중앙 관리하며 서비스 로컬 권한을 자동 승계하지 않음</span></article>
      <article><small>BOUNDARY</small><strong>Community owns participation</strong><span>Circle · 회원 · 추천 · 토론 운영은 Community가 소유하고, 교회 등은 소비자·호스트 Workspace로 참여</span></article>
    </div>
    <p class="community-admin-note">서비스 상태·배포·보안 진단은 중앙 운영센터가 관찰하지만, 외부 제공 서비스의 콘텐츠·모임·참여·운영 설정은 각 서비스/사이트 관리자 화면을 기준으로 관리합니다.</p>`;
  content.append(section);
  window.EKODICommunityAdmin = Object.freeze({
    panel: section,
    provider: 'Community',
    services: Object.freeze([{ id: 'reading-dialogue', name: '함께읽기', canonicalPath: '/community/reading' }]),
    mount: () => section,
  });
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: 'community' } }));
})();
