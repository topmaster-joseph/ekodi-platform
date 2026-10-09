// Pure, tenant-scoped setup view. No tokens or provider secrets enter this markup.
export function renderMallSocialSetup({ platform = {}, connections = [], registeredAccounts = [], channels = [], jobs = [], policy = {} } = {}) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const targets = [
    { id: 'facebook', label: 'Facebook', key: 'metaConfigured', setup: 'Meta 앱 ID/Secret 설정 필요', link: 'https://developers.facebook.com/apps/', action: 'Facebook 페이지 연결', info: '페이지 관리 권한 · 제휴고지 포함' },
    { id: 'instagram', label: 'Instagram', key: 'metaConfigured', setup: 'Meta 앱 ID/Secret 설정 필요', link: 'https://developers.facebook.com/apps/', action: 'Instagram 연결', info: '프로페셔널 계정 · 게시 권한 필요' },
    { id: 'threads', label: 'Threads', key: 'threadsConfigured', setup: 'Threads 앱 설정 필요', link: 'https://developers.facebook.com/apps/', action: 'Threads 연결', info: '게시 권한 · 이미지 URL 필요' },
    { id: 'youtube', label: 'YouTube', key: 'youtubeConfigured', setup: 'Google OAuth 설정 필요', link: 'https://console.cloud.google.com/apis/credentials', action: 'YouTube 연결', info: '영상 자산 준비 후 게시 · Shorts 자동제작 별도' },
  ];
  const active = connections.filter(row => row.status === 'active');
  const verified = id => active.find(row => row.provider === id);
  const queued = jobs.filter(row => ['queued', 'scheduled', 'retrying'].includes(row.status)).length;
  const published = jobs.filter(row => row.status === 'published').length;
  const cards = targets.map(target => {
    const connected = verified(target.id);
    const configured = platform[target.key] === true;
    const registered = registeredAccounts.some(row => row.provider === target.id || row.serviceKey === target.id);
    const channel = channels.find(row => row.provider === target.id && row.status === 'active');
    const on = Boolean(channel && channel.config?.autoPublishEnabled !== false);
    const label = connected ? 'OAuth 연결 완료' : !configured ? '앱 설정 필요' : registered ? '계정 인증 필요' : '계정 연결 필요';
    return `<article class="mall-social-provider" data-mall-provider="${esc(target.id)}">
      <div class="mall-social-provider-head"><strong>${esc(target.label)}</strong><span class="mall-social-pill ${connected ? 'ready' : ''}">${esc(label)}</span></div>
      <p>${esc(target.info)}</p>
      <div class="mall-social-provider-meta">플랫폼 ${configured ? '준비됨' : '미설정'} · 자동발행 ${on ? 'ON' : 'OFF'}</div>
      <div class="mall-social-provider-actions">
        <button type="button" class="button ${configured && !connected ? 'primary' : ''}" data-channel-quick="${esc(target.id)}" ${configured ? '' : 'disabled'}>${esc(connected ? '계정 관리' : target.action)}</button>
        ${!configured ? `<a href="${esc(target.link)}" target="_blank" rel="noopener noreferrer" class="button">앱 등록 안내</a>` : ''}
      </div>
      ${!configured ? `<small class="mall-social-blocker">${esc(target.setup)} — 관리자 시스템 비밀정보 저장소에서 등록하세요. 이 화면에 Secret을 입력하지 않습니다.</small>` : ''}
    </article>`;
  }).join('');
  const policyMode = String(policy.mode || 'review');
  return `<section class="mall-social-setup" aria-labelledby="mallSocialHeading">
    <div class="mall-social-heading"><div><h2 id="mallSocialHeading">에코디몰 SNS 자동발행 · 통합 설정</h2>
      <p>한 화면에서 계정 연결 → 발행 정책 → 시험 게시 → 결과 확인</p></div>
      <span class="mall-social-pill ${active.length ? 'ready' : ''}">OAuth 연결 ${active.length}개</span></div>
    <div class="mall-social-steps" aria-label="설정 순서"><span><b>1</b> 연결 확인</span><span><b>2</b> 정책 저장</span><span><b>3</b> 시험 발행</span><span><b>4</b> 결과 검증</span></div>
    <div class="mall-social-providers">${cards}</div>
    <div class="mall-social-summary" role="status"><span><b>발행 모드</b> ${esc(policyMode === 'autonomous' ? '자율' : policyMode === 'assisted' ? '보조' : '검토 후 게시')}</span>
      <span><b>게시 성공 기록</b> ${published}건</span><span><b>처리 대기</b> ${queued}건</span>
      <span><b>유료 광고</b> 자동 집행 OFF</span></div>
    <p class="mall-social-security">비밀번호·OAuth 토큰을 직접 입력하지 않습니다. 공식 로그인에서 권한을 승인하고, 제휴 게시물에 광고·제휴 고지문을 포함하세요. 발행 전 상품 사진 사용 권한도 확인해야 합니다.</p>
  </section>`;
}
