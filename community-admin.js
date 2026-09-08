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
        <p class="community-admin-kicker">COMMUNITY · SERVICE OPERATIONS</p>
        <h2>커뮤니티 운영</h2>
        <p>관계, 그룹, 참여, 소통을 담당하는 독립 Community 서비스를 관리합니다.</p>
      </div>
      <a class="community-admin-link" href="https://community.ekodi.kr/" target="_blank" rel="noopener">Community 열기</a>
    </div>
    <div class="community-admin-grid">
      <article><small>PUBLIC SERVICE</small><strong>community.ekodi.kr</strong><span>공개 Community 화면과 사용자 흐름</span></article>
      <article><small>BOUNDARY</small><strong>Independent platform</strong><span>Community 데이터와 서비스 경계를 독립적으로 유지</span></article>
      <article><small>MINISTRY REPORTS</small><strong>Church Pastor Admin</strong><span>교회 사역보고는 교회 목회자 관리자에서 관리</span></article>
    </div>
    <p class="community-admin-note">서비스 상태, 배포, 보안 진단은 운영센터의 상태·관측 및 배포 메뉴에서 공통 관리합니다.</p>`;
  content.append(section);
  window.EKODICommunityAdmin = Object.freeze({ panel: section, mount: () => section });
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: 'community' } }));
})();