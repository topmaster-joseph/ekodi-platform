const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const interpretationOptions=`<option value="original">원음</option><option value="ko">한국어</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="vi">Tiếng Việt</option><option value="mn">Монгол</option>`;

export function tenantLivePage(tenant){
  const name=esc(tenant.name),title=esc(tenant.title),home=esc(tenant.home),path=esc(tenant.path),robots=esc(tenant.robots||'index,follow');
  const missionShell=tenant.workspace==='ekodimission';
  const churchShell=tenant.apiTenant==='ekodichurch'&&tenant.path==='/live/church/';
  const assetVersion=churchShell?'20261128-live-share-2':'20261128-live-share-2';
  const shellHead=churchShell?'<link rel="stylesheet" href="/tenant-live-church.css">':missionShell?'<link rel="stylesheet" href="/ekodimission/assets/shell.css">':'';
  const header=churchShell?"<header class=\"church-live-site-header site-header\" id=\"top\">\n    <a class=\"church-live-brand\" href=\"/ekodichurch/\" aria-label=\"에코디교회 홈\"><span class=\"brand-mark\" aria-hidden=\"true\">E</span><span><strong>에코디교회</strong><small>EKODI CHURCH</small></span></a>\n    <button type=\"button\" id=\"churchLiveMenu\" class=\"church-live-menu\" aria-controls=\"churchLiveNav\" aria-expanded=\"false\" aria-label=\"메뉴 열기\"><span></span><span></span></button>\n    <nav id=\"churchLiveNav\" aria-label=\"에코디교회 주요 메뉴\">\n      <a href=\"/ekodichurch/#worship\">예배안내</a>\n      <a href=\"/ekodichurch/#online\" aria-current=\"page\">온라인</a>\n      <a href=\"/ekodichurch/#location\">오시는 길</a>\n      <a href=\"/qtin/church\">큐티인 신청</a>\n      <a href=\"/ekodichurch/my/\">마이페이지</a>\n    </nav>\n    <div class=\"church-live-actions\"><span id=\"liveState\">방송 확인 중</span><a href=\"/ekodichurch/#online\">교회 홈</a></div>\n  </header>"
    :missionShell
    ?`<header class="mission-site-header"><a class="mission-brand" href="${home}"><span class="mission-brand-mark">E</span><span><strong>${name}</strong><small>EKODI MISSION</small></span></a><nav aria-label="주요 메뉴" data-mission-nav></nav></header><div class="mission-live-state"><span id="liveState">확인 중</span></div>`
    :`<header class="live-header"><a class="brand" href="${home}"><span class="mark">E</span><span><strong>${name}</strong><small>LIVE</small></span></a><div class="header-actions"><span id="liveState">확인 중</span><a href="${home}">홈</a></div></header>`;
  // Canonical Church studio only: local rehearsal never creates a room or public stream.
  const rehearsalPanel=churchShell?`<section class="church-rehearsal" aria-label="방송 전 비공개 테스트">
    <strong>방송 전 비공개 테스트</strong>
    <p>영상·마이크·화면 구성을 이 기기에서만 녹화합니다. 방송 서버나 외부 채널에 송출하지 않습니다.</p>
    <div class="church-rehearsal-actions">
      <button type="button" id="localRehearsalStart">테스트 녹화 시작</button>
      <button type="button" id="localRehearsalStop" disabled>녹화 중지 · 확인</button>
    </div>
    <p id="localRehearsalStatus" role="status" aria-live="polite">시작 전 · 카메라와 마이크를 준비하세요.</p>
    <video class="church-rehearsal-playback hidden" id="localRehearsalPlayback" controls playsinline preload="metadata" aria-label="테스트 녹화 재생"></video>
  </section>`:'';

  // Church-only companion: one media engine, separate published worship materials.
  const churchViewerGuide=churchShell?`<section id="churchLiveGuide" class="church-live-guide" aria-label="예배와 모임 진행 안내">
    <div class="church-guide-heading"><div><small>ORDER OF SERVICE · LIVE</small><h2 id="churchGuideHeading">예배·모임 진행 안내</h2></div><span id="churchGuideDate">자료 확인 중</span></div>
    <div class="church-guide-language">
      <label for="churchGuideLanguage" id="churchGuideLanguageLabel">안내 언어</label>
      <select id="churchGuideLanguage" aria-label="안내 자료 표시 언어">
        <option value="ko">한국어</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="vi">Tiếng Việt</option><option value="mn">Монгол</option>
      </select>
      <span id="churchGuideLanguageNote">진행 안내만 번역합니다. 설교·PPT 원문과 통역 음성은 별도입니다.</span>
    </div>
    <div class="church-view-options" role="group" aria-label="화면 배치">
      <button type="button" data-church-view="split" aria-pressed="true">안내 + 영상</button>
      <button type="button" data-church-view="video" aria-pressed="false">영상 집중</button>
      <button type="button" data-church-view="guide" aria-pressed="false">안내 집중</button>
    </div>
    <div class="church-guide-tabs" role="tablist" aria-label="안내 자료 유형">
      <button id="churchGuideOrderTab" type="button" role="tab" aria-controls="churchGuideOrder" aria-selected="true" data-church-material="order">순서지</button>
      <button id="churchGuideSlidesTab" type="button" role="tab" aria-controls="churchGuideSlides" aria-selected="false" data-church-material="slides">안내 PPT</button>
    </div>
    <section id="churchGuideOrder" role="tabpanel" aria-labelledby="churchGuideOrderTab"><p class="church-guide-current" id="churchGuideCurrent">진행 순서를 확인하고 있습니다.</p><ol class="church-guide-order" id="churchGuideOrderList"></ol></section>
    <section id="churchGuideSlides" role="tabpanel" aria-labelledby="churchGuideSlidesTab" hidden>
      <div class="church-guide-slide" aria-live="polite"><small id="churchGuideSlideKicker"></small><h3 id="churchGuideSlideTitle">발표자료 준비 중</h3><div id="churchGuideSlideLines"></div></div>
    </section>
    <div class="church-guide-bottom"><span id="churchGuideCount" aria-live="polite">안내 준비 중</span><div><button type="button" id="churchGuideFollow" aria-pressed="true">진행자 따라가기</button><button type="button" id="churchGuidePrev" aria-label="이전 자료">이전</button><button type="button" id="churchGuideNext" aria-label="다음 자료">다음</button></div></div>
    <p class="church-guide-sync" id="churchGuideStatus" role="status" aria-live="polite">공개된 예배자료를 연결하고 있습니다.</p>
    <a class="church-guide-source" id="churchGuideSource" href="/ekodichurch/#worship">공식 예배자료 열기</a>
  </section>`:'';
  const churchHostGuide=churchShell?`<details class="church-host-guide" id="churchHostGuide"><summary>순서지 · PPT 진행 제어</summary>
    <p>로그인 권한을 확인한 방송 진행자만 서버에 현재 순서를 공유할 수 있습니다. 자료는 교회에서 발행한 원본을 사용합니다.</p>
    <div class="church-host-guide-actions"><button type="button" id="churchHostPrev" disabled>← 이전</button><strong id="churchHostProgress">자료 준비 중</strong><button type="button" id="churchHostNext" disabled>다음 →</button></div>
    <p id="churchHostGuideStatus" role="status">방송 시작 뒤 진행자 조작이 활성화됩니다.</p>
    <a href="/ekodichurch/mypage/">교회 마이페이지 · 예배자료 검토·공개</a>
  </details>`:'';
  const shellScript=churchShell?'<script src="/tenant-live-church.js" defer></script>':missionShell?'<script src="/ekodimission/assets/shell.js" defer></script>':'';
  const body=`<!doctype html><html lang="ko-KR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="${robots}"><title>${title}</title><meta name="description" content="${name} 실시간 방송"><link rel="stylesheet" href="/tenant-live.css?v=${assetVersion}"><link rel="stylesheet" href="/live-interpretation.css?v=20261107-1">${shellHead}</head>
<body data-tenant="${esc(tenant.apiTenant)}" data-room-mode="${esc(tenant.mode)}" data-live-path="${path}" data-auth-site="${esc(tenant.authSite)}" data-name="${name}" data-default-title="${title}">
${header}
<main class="live-shell">
<section id="entryView" class="live-intro${missionShell?' mission-live-intro':''}"><p class="eyebrow">EKODI REALTIME</p><h1>${name}<br><em>실시간 방송</em></h1><p>방송하거나 바로 시청합니다.</p><div class="entry-actions"><button class="primary" id="hostButton">방송하기</button><button id="joinButton">시청·참여</button></div><p id="entryNote">공개 방송은 바로 볼 수 있습니다.</p></section>

<section id="studioView" class="studio hidden">
  <div class="stage" id="programStage"><video id="mainVideo" autoplay playsinline muted></video><video id="cameraSource" class="source-video" autoplay playsinline muted aria-hidden="true"></video><video id="screenSource" class="source-video" autoplay playsinline muted aria-hidden="true"></video><div id="programOverlayLayer" class="program-overlay-layer" aria-label="방송 화면 추가 소스"></div><div id="programPlaceholder" class="placeholder">카메라를 켜 주세요.</div><span id="programBadge">대기</span></div>
  <aside class="panel compact-panel">
    <div class="studio-title"><div><small>LIVE STUDIO</small><h2 id="roomTitle">${title}</h2></div><div class="studio-live-meta"><span id="connectionState">대기</span><span id="liveElapsed" class="live-elapsed">00:00</span></div></div>
    <div class="studio-status-strip" aria-label="장비 상태"><span id="cameraControlState">카메라 꺼짐</span><span id="micControlState">마이크 꺼짐</span><span id="screenControlState">화면공유 꺼짐</span></div>
    <div id="roomLinks" class="hidden compact-links studio-share-links"><label>참여 링크<input id="shareLink" readonly></label><div><button id="openViewerButton" type="button">시청 화면</button><button id="copyLinkButton" type="button">링크 복사</button></div></div>
    <div class="controls compact-controls"><button id="cameraButton" type="button" aria-pressed="false">카메라</button><button id="micButton" type="button" aria-pressed="false">마이크</button><button id="screenButton" type="button" aria-pressed="false">화면공유</button><button id="openManagementCameraButton" type="button">QR카메라</button></div>

    <details class="compact-settings"><summary>화면 설정</summary><div class="video-layout-controls" aria-label="방송 화면 설정"><div class="layout-buttons"><button id="landscapeButton" type="button" class="active" aria-pressed="true">16:9</button><button id="portraitButton" type="button" aria-pressed="false">9:16</button></div><label>카메라<select id="cameraFitSelect"><option value="contain" selected>맞춤</option><option value="cover">채우기</option></select></label></div></details>

    <details class="source-manager compact-section" open><summary>장면 · 소스</summary>
      <div class="source-subhead"><strong>방송 화면</strong><span>클릭하거나 미리보기에 끌어놓기</span></div>
      <button id="presenterOverlaySource" class="source-card" type="button" draggable="true"><b>발표자</b><span>화면에 추가</span></button>
      <button id="chatOverlaySource" class="source-card" type="button" draggable="true"><b>채팅</b><span>화면에 추가</span></button>
      <div class="camera-connect"><select id="extraCameraSelect" aria-label="이 기기 추가 카메라"><option value="">이 기기 카메라</option></select><button id="connectExtraCameraButton" type="button">연결</button></div>
      <div id="extraCameraSources" class="source-list"></div>
    </details>

    <details class="participant-manager compact-section" open><summary>참여자 · 원격 카메라</summary>
      <div class="source-head participant-head"><strong>QR 관리카메라</strong><span id="managementCameraState">대기</span></div>
      <div id="managementCameraSources" class="source-list"></div>
      <div class="source-head participant-head"><strong>참여 카메라 요청</strong><div class="source-head-actions"><span id="participantRequestState">0건 대기</span><button id="refreshParticipantSourcesButton" type="button">새로고침</button></div></div>
      <div id="participantRequests" class="participant-requests"></div><div id="participantSources" class="source-list"></div>
    </details>

    <details class="live-chat-box compact-section"><summary>채팅</summary><div class="source-head"><strong>실시간 채팅</strong><span id="studioChatState">대기</span></div><div id="studioChatMessages" class="chat-messages"></div><form id="studioChatForm" class="chat-form"><input id="studioChatInput" maxlength="500" autocomplete="off" placeholder="메시지"><button type="submit">전송</button></form></details>

    <details class="compact-section live-interpretation-section" open><summary>동시통역 자막</summary><div data-live-interpretation-console><small>통역 자막 도구를 불러오는 중</small></div></details>

    <details class="delivery-settings compact-section"><summary>송출·저장</summary><div class="delivery-fixed"><span class="delivery-check" aria-hidden="true">✓</span><div><strong>EKODI · 자동 저장</strong></div><span class="delivery-default">기본</span></div><div class="external-head"><strong>외부 동시방송</strong><button id="refreshDestinationsButton" type="button">확인</button></div><div id="externalDestinations" class="destination-options"><small>로그인 후 확인</small></div><div class="live-simulcast" data-live-simulcast></div></details>

    ${churchHostGuide}
    ${rehearsalPanel}
    <div class="broadcast-actions"><button class="primary" id="goLiveButton">방송 시작</button><button class="danger hidden" id="endLiveButton" disabled>방송 종료</button></div>
    <div id="liveShare" class="live-share hidden" role="region" aria-label="방송 시청 링크"><strong>방송 시청 링크</strong><small>이 링크를 보내면 누구나 바로 시청할 수 있습니다.</small><input id="liveShareUrl" readonly aria-label="방송 시청 링크"><div class="live-share-actions"><button id="liveShareCopy" type="button">링크 복사</button><button id="liveShareSend" type="button">공유하기</button><a id="liveShareOpen" href="#" target="_blank" rel="noopener">시청 화면 열기</a></div></div>
    <div id="hostAccessStatus" class="studio-host-status hidden" role="status" aria-live="polite"></div>
    <a id="hostAccessLogin" class="studio-host-login hidden" href="#" rel="nofollow">Google 계정 선택 · 진행자 권한 확인</a>
    <div id="statusLog" class="status" aria-live="polite">준비</div>
  </aside>
</section>

<section id="viewerView" class="viewer hidden">
  ${churchViewerGuide}
  <div class="stage viewer-stage"><video id="viewerVideo" autoplay playsinline controls></video><div id="viewerEmpty" class="placeholder">연결 중</div></div>
  <aside class="panel viewer-panel"><small>LIVE</small><h2 id="viewerTitle">${title}</h2>
    <section class="interpretation-box language-control"><div class="source-head"><strong>듣기 언어</strong><span id="interpretationState">원음</span></div><select id="viewerListenLanguage" aria-label="동시통역 듣기 언어">${interpretationOptions}</select></section>
    <section class="viewer-camera-box"><div class="source-head"><strong>참여</strong><span id="participantCameraState">대기</span></div><select id="participantSpeakLanguage" aria-label="말하기 언어"><option value="ko">한국어</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="vi">Tiếng Việt</option><option value="mn">Монгол</option></select><select id="participantCameraSelect"><option value="">카메라 선택</option></select><button id="requestSpeakButton" type="button">카메라 참여 요청</button><video id="participantCameraPreview" class="participant-camera-preview hidden" autoplay playsinline muted></video></section>
    <details class="live-chat-box viewer-chat"><summary>채팅</summary><div id="viewerChatMessages" class="chat-messages"></div><form id="viewerChatForm" class="chat-form"><input id="viewerChatInput" maxlength="500" autocomplete="off" placeholder="메시지"><button type="submit">전송</button></form></details>
    <div id="viewerStatus" class="status"></div>
  </aside>
</section>
</main>
${churchShell?"<footer class=\"church-live-site-footer site-footer church-footer\" data-ekodi-service-footer>\n  <div class=\"church-live-site-footer-inner church-footer-inner\">\n    <strong>EKODI CHURCH</strong>\n    <div class=\"church-live-site-footer-info\"><span>전남 무안군 청계면 백련동1길 17-4, 1층</span><span>에코디교회 정찬균</span><span>고유번호 307-82-82097</span><a href=\"mailto:ekodichurch@gmail.com\">ekodichurch@gmail.com</a></div>\n    <nav aria-label=\"법적 고지\"><a href=\"/privacy\">개인정보처리방침</a><a href=\"/terms\">이용약관</a><a href=\"mailto:ekodibiz@gmail.com\">문의</a></nav>\n    <div class=\"church-live-site-footer-bottom\"><span>© 2026 EKODI CHURCH</span><a href=\"#top\">맨 위로 ↑</a></div>\n  </div>\n</footer>":''}

<dialog id="managementCameraDialog" class="camera-pair-dialog"><form method="dialog"><button class="dialog-close" aria-label="닫기">×</button></form><p class="eyebrow">QR CAMERA</p><h2>관리카메라 추가</h2><canvas id="managementCameraQr" width="196" height="196" aria-label="관리카메라 연결 QR"></canvas><p class="pair-copy">QR을 찍고 승인합니다.</p><input id="managementCameraUrl" readonly aria-label="관리카메라 연결 주소"><div class="pair-actions"><button id="copyManagementCameraUrlButton" type="button">링크 복사</button><button id="newManagementCameraPairButton" type="button">새 QR</button></div><div id="managementCameraPairs" class="pair-list"></div></dialog>
${shellScript}<script src="/tenant-live.js?v=${assetVersion}" defer></script><script src="/live-interpretation.js?v=20261107-1" defer></script></body></html>`;
  const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  // Only the requested public viewer mode can opt into same-origin framing.
  // Studio and every other tenant remain DENY via the platform edge policy.
  if(churchShell && tenant.embeddedViewer === true) headers['content-security-policy']="frame-ancestors 'self'; object-src 'none'; base-uri 'self'";
  if(tenant.robots)headers['x-robots-tag']=String(tenant.robots);
  if(tenant.route)headers['x-ekodi-route']=String(tenant.route);
  if(tenant.publicationStatus)headers['x-ekodi-publication-status']=String(tenant.publicationStatus);
  if(tenant.independentSite)headers['x-ekodi-independent-site']='true';
  if(tenant.workspace)headers['x-ekodi-workspace']=String(tenant.workspace);
  return new Response(body,{status:200,headers});
}

export function managementCameraPage(pairCode){
  const code=esc(pairCode);
  const body=`<!doctype html><html lang="ko-KR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>EKODI 관리카메라</title><link rel="stylesheet" href="/tenant-live.css?v=20261107-1"></head><body class="management-camera-body" data-camera-pair="${code}"><main class="management-camera-shell"><p class="eyebrow">EKODI LIVE</p><h1>관리카메라</h1><video id="managementCameraPreview" autoplay playsinline muted></video><div class="management-camera-controls"><button id="managementCameraSwitch" type="button">전·후면</button><button id="managementCameraConnect" class="primary" type="button">카메라 연결</button></div><p id="managementCameraDeviceStatus" class="status">대기</p></main><script src="/tenant-live.js?v=20261107-1" defer></script></body></html>`;
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer'}});
}
