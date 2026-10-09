// Tenant-scoped readiness board. OAuth secrets never enter this presentation.
export function renderMallSocialSetup({ platform = {}, connections = [], registeredAccounts = [], channels = [], jobs = [], policy = {} } = {}) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const targets = [
    { id: 'facebook', label: 'Facebook', key: 'metaConfigured', setup: 'Meta 앱 ID·Secret 설정 필요', link: 'https://developers.facebook.com/apps/', action: '페이지 연결', info: '페이지 관리 권한 · 광고/제휴 표시' },
    { id: 'instagram', label: 'Instagram', key: 'metaConfigured', setup: 'Meta 앱 ID·Secret 설정 필요', link: 'https://developers.facebook.com/apps/', action: '계정 연결', info: '프로페셔널 계정 · 콘텐츠 게시 권한' },
    { id: 'threads', label: 'Threads', key: 'threadsConfigured', setup: 'Threads 앱 등록 및 권한 설정 필요', link: 'https://developers.facebook.com/apps/', action: '계정 연결', info: 'Threads 게시 권한 · 이미지 필요' },
    { id: 'youtube', label: 'YouTube', key: 'youtubeConfigured', setup: 'Google OAuth 앱 구성 필요', link: 'https://console.cloud.google.com/apis/credentials', action: 'Google 계정 연결', info: 'OAuth 연결과 동영상 제작 기능은 별개' },
  ];
  const active = connections.filter(row => row.status === 'active');
  const verified = id => active.find(row => row.provider === id);
  const queued = jobs.filter(row => ['queued', 'scheduled', 'retrying'].includes(row.status)).length;
  const published = jobs.filter(row => row.status === 'published').length;
  const publishReady = channels.filter(row => row.status === 'active' && row.config?.autoPublishEnabled !== false &&
    active.some(c => c.provider === row.provider && String(c.external_id || '') === String(row.external_account_id || ''))).length;
  const cards = targets.map(target => {
    const connected = Boolean(verified(target.id));
    const configured = platform[target.key] === true;
    const registered = registeredAccounts.some(row => row.provider === target.id);
    const channel = channels.find(row => row.provider === target.id && row.status === 'active');
    const channelOn = connected && Boolean(channel && channel.config?.autoPublishEnabled !== false);
    const label = connected ? 'OAuth 인증 완료' : !configured ? '플랫폼 설정 필요' : registered ? 'OAuth 인증 필요' : '계정 연결 필요';
    return `<article class="mall-social-provider" data-mall-provider="${esc(target.id)}">
      <div class="mall-social-provider-head"><strong>${esc(target.label)}</strong><span class="mall-social-pill ${connected ? 'ready' : ''}">${esc(label)}</span></div>
      <p>${esc(target.info)}</p>
      <div class="mall-social-provider-meta">앱 ${configured ? '준비됨' : '미설정'} · 실제 발행 ${channelOn ? '사용 중' : '중지'}</div>
      <div class="mall-social-provider-actions">
        <button type="button" class="button ${configured && !connected ? 'primary' : ''}" data-channel-quick="${esc(target.id)}" ${configured ? '' : 'disabled'}>${esc(connected ? '채널 관리' : target.action)}</button>
        ${!configured ? `<a href="${esc(target.link)}" target="_blank" rel="noopener noreferrer" class="button">공식 앱 안내</a>` : ''}
      </div>
      ${!configured ? `<small class="mall-social-blocker">${esc(target.setup)} — 비밀정보는 관리자 Secret 저장소에 등록해야 합니다.</small>` : ''}
    </article>`;
  }).join('');
  const mode = policy.mode === 'autonomous' ? '자율' : policy.mode === 'assisted' ? '보조' : '검토 후 게시';
  const youtubeConnected = Boolean(verified('youtube'));
  const youtubeReady = platform.youtubeConfigured === true;
  const next = publishReady ? '게시 준비 완료: 발행 정책을 확인한 후 시험 게시하세요.' :
    active.length ? 'OAuth는 연결됐지만 실제 발행 채널이 비활성화돼 있습니다. 아래 연결 채널 상세 설정을 확인하세요.' :
    youtubeReady ? '첫 작업: YouTube Google 계정의 OAuth 연결을 완료하세요. Meta·Threads는 앱 등록이 추가로 필요합니다.' :
    '첫 작업: 플랫폼 앱을 등록한 다음 공식 OAuth로 계정을 연결하세요.';
  const youtubeStart = youtubeReady && !youtubeConnected ? `<form id="mallSocialYoutubeConnectForm" class="mall-social-start" aria-label="YouTube 최초 연결">
    <label for="mallSocialYoutubeEmail">YouTube Google 계정 이메일</label>
    <input id="mallSocialYoutubeEmail" type="email" name="email" autocomplete="email" required maxlength="240" placeholder="Google 계정 이메일 입력">
    <button class="button primary" type="submit">YouTube OAuth 연결 시작</button>
    <small>이메일은 계정 식별에만 사용합니다. 암호 입력 없이 Google 공식 동의 화면으로 이동합니다.</small>
    <div id="mallSocialYoutubeMessage" role="status" aria-live="polite"></div>
  </form>` : '';
  return `<section class="mall-social-setup" aria-labelledby="mallSocialHeading">
    <div class="mall-social-heading"><div><h2 id="mallSocialHeading">에코디몰 SNS 자동발행 · 통합 설정</h2>
      <p>계정 인증 → 정책 → 시험 게시 → 결과 검증을 이 페이지에서 관리합니다.</p></div>
      <span class="mall-social-pill ${publishReady ? 'ready' : ''}">실제 발행 가능 ${publishReady}개</span></div>
    <div class="mall-social-steps" aria-label="설정 순서"><span><b>1</b> 연결 확인</span><span><b>2</b> 정책 저장</span><span><b>3</b> 시험 발행</span><span><b>4</b> 결과 검증</span></div>
    <div class="mall-social-providers">${cards}</div>
    <div class="mall-social-next ${publishReady ? 'ready' : ''}" role="status"><strong>${publishReady ? '발행 준비' : '연결 준비 중'}</strong> ${esc(next)}</div>
    ${youtubeStart}
    <div class="mall-social-summary"><span><b>저장된 정책</b> ${esc(mode)}${publishReady ? '' : ' · 실행 대기'}</span>
      <span><b>OAuth 연결</b> ${active.length}개</span><span><b>게시 성공 기록</b> ${published}건</span>
      <span><b>처리 대기</b> ${queued}건</span><span><b>유료 광고</b> 자동 집행 OFF</span></div>
    <p class="mall-social-security">플랫폼 설정과 OAuth 연결은 다릅니다. 저장된 자율 정책은 실제 채널 인증·발행 허용 여부를 대신하지 않습니다. 제휴 게시물은 광고·제휴 고지와 이미지 사용 권한을 확인해야 합니다.</p>
  </section>`;
}
