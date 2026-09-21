const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const interpretationOptions=`<option value="original">원음</option><option value="ko">한국어</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="vi">Tiếng Việt</option><option value="mn">Монгол</option>`;

export function tenantLivePage(tenant){
  const name=esc(tenant.name),title=esc(tenant.title),home=esc(tenant.home),path=esc(tenant.path),robots=esc(tenant.robots||'index,follow');
  const missionShell=tenant.workspace==='ekodimission';
  const shellHead=missionShell?'<link rel="stylesheet" href="/ekodimission/assets/shell.css">':'';
  const header=missionShell
    ?`<header class="mission-site-header"><a class="mission-brand" href="${home}"><span class="mission-brand-mark">E</span><span><strong>${name}</strong><small>EKODI MISSION</small></span></a><nav aria-label="주요 메뉴" data-mission-nav></nav></header><div class="mission-live-state"><span id="liveState">확인 중</span></div>`
    :`<header class="live-header"><a class="brand" href="${home}"><span class="mark">E</span><span><strong>${name}</strong><small>LIVE</small></span></a><div class="header-actions"><span id="liveState">확인 중</span><a href="${home}">홈</a></div></header>`;
  const shellScript=missionShell?'<script src="/ekodimission/assets/shell.js" defer></script>':'';
  const body=`<!doctype html><html lang="ko-KR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="${robots}"><title>${title}</title><meta name="description" content="${name} 실시간 방송"><link rel="stylesheet" href="/tenant-live.css">${shellHead}</head>
<body data-tenant="${esc(tenant.apiTenant)}" data-room-mode="${esc(tenant.mode)}" data-live-path="${path}" data-auth-site="${esc(tenant.authSite)}" data-name="${name}" data-default-title="${title}">
${header}
<main class="live-shell">
<section id="entryView" class="live-intro"><p class="eyebrow">EKODI LIVE</p><h1>${name}<br><em>실시간 방송</em></h1><p>방송하거나 바로 시청합니다.</p><div class="entry-actions"><button class="primary" id="hostButton">방송하기</button><button id="joinButton">시청·참여</button></div><p id="entryNote">공개 방송은 바로 볼 수 있습니다.</p></section>

<section id="studioView" class="studio hidden">
  <div class="stage" id="programStage"><video id="mainVideo" autoplay playsinline muted></video><video id="cameraSource" class="source-video" autoplay playsinline muted aria-hidden="true"></video><video id="screenSource" class="source-video" autoplay playsinline muted aria-hidden="true"></video><div id="programOverlayLayer" class="program-overlay-layer" aria-label="방송 화면 추가 소스"></div><div id="programPlaceholder" class="placeholder">카메라를 켜 주세요.</div><span id="programBadge">대기</span></div>
  <aside class="panel compact-panel">
    <div class="studio-title"><div><small>LIVE STUDIO</small><h2 id="roomTitle">${title}</h2></div><span id="connectionState">대기</span></div>
    <div class="controls compact-controls"><button id="cameraButton">카메라</button><button id="micButton">마이크</button><button id="screenButton">화면공유</button><button id="openManagementCameraButton">QR카메라</button></div>

    <details class="compact-settings"><summary>화면 설정</summary><div class="video-layout-controls" aria-label="방송 화면 설정"><div class="layout-buttons"><button id="landscapeButton" type="button" class="active" aria-pressed="true">16:9</button><button id="portraitButton" type="button" aria-pressed="false">9:16</button></div><label>카메라<select id="cameraFitSelect"><option value="contain" selected>맞춤</option><option value="cover">채우기</option></select></label></div></details>

    <details class="source-manager compact-section" open><summary>소스</summary>
      <button id="presenterOverlaySource" class="source-card" type="button" draggable="true"><b>발표자</b><span>화면에 추가</span></button>
      <button id="chatOverlaySource" class="source-card" type="button" draggable="true"><b>채팅</b><span>화면에 추가</span></button>
      <div class="camera-connect"><select id="extraCameraSelect" aria-label="이 기기 추가 카메라"><option value="">이 기기 카메라</option></select><button id="connectExtraCameraButton" type="button">연결</button></div>
      <div id="extraCameraSources" class="source-list"></div>
      <div class="source-head participant-head"><strong>QR 관리카메라</strong><span id="managementCameraState">대기</span></div>
      <div id="managementCameraSources" class="source-list"></div>
      <div class="source-head participant-head"><strong>참여자</strong><button id="refreshParticipantSourcesButton" type="button">새로고침</button></div>
      <div id="participantRequests" class="participant-requests"></div><div id="participantSources" class="source-list"></div>
    </details>

    <details class="live-chat-box compact-section"><summary>채팅</summary><div class="source-head"><strong>실시간 채팅</strong><span id="studioChatState">대기</span></div><div id="studioChatMessages" class="chat-messages"></div><form id="studioChatForm" class="chat-form"><input id="studioChatInput" maxlength="500" autocomplete="off" placeholder="메시지"><button type="submit">전송</button></form></details>

    <section class="interpretation-box compact-interpretation"><strong>동시통역</strong><div class="language-chips"><span>EN</span><span>中</span><span>日</span><span>VI</span><span>MN</span></div></section>

    <details class="delivery-settings compact-section"><summary>송출·저장</summary><div class="delivery-fixed"><span class="delivery-check" aria-hidden="true">✓</span><div><strong>EKODI · 자동 저장</strong></div><span class="delivery-default">기본</span></div><div class="external-head"><strong>외부 동시방송</strong><button id="refreshDestinationsButton" type="button">확인</button></div><div id="externalDestinations" class="destination-options"><small>로그인 후 확인</small></div></details>

    <div class="broadcast-actions"><button class="primary" id="goLiveButton">방송 시작</button><button class="danger" id="endLiveButton" disabled>종료</button></div>
    <div id="statusLog" class="status">준비</div>
    <div id="roomLinks" class="hidden compact-links"><label>참여 링크<input id="shareLink" readonly></label><div><button id="openViewerButton" type="button">시청 화면</button><button id="copyLinkButton" type="button">링크 복사</button></div></div>
  </aside>
</section>

<section id="viewerView" class="viewer hidden">
  <div class="stage viewer-stage"><video id="viewerVideo" autoplay playsinline controls></video><div id="viewerEmpty" class="placeholder">연결 중</div></div>
  <aside class="panel viewer-panel"><small>LIVE</small><h2 id="viewerTitle">${title}</h2>
    <section class="interpretation-box language-control"><div class="source-head"><strong>듣기 언어</strong><span id="interpretationState">원음</span></div><select id="viewerListenLanguage" aria-label="동시통역 듣기 언어">${interpretationOptions}</select></section>
    <section class="viewer-camera-box"><div class="source-head"><strong>참여</strong><span id="participantCameraState">대기</span></div><select id="participantSpeakLanguage" aria-label="말하기 언어"><option value="ko">한국어</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="vi">Tiếng Việt</option><option value="mn">Монгол</option></select><select id="participantCameraSelect"><option value="">카메라 선택</option></select><button id="requestSpeakButton" type="button">카메라 참여 요청</button><video id="participantCameraPreview" class="participant-camera-preview hidden" autoplay playsinline muted></video></section>
    <details class="live-chat-box viewer-chat"><summary>채팅</summary><div id="viewerChatMessages" class="chat-messages"></div><form id="viewerChatForm" class="chat-form"><input id="viewerChatInput" maxlength="500" autocomplete="off" placeholder="메시지"><button type="submit">전송</button></form></details>
    <div id="viewerStatus" class="status"></div>
  </aside>
</section>
</main>

<dialog id="managementCameraDialog" class="camera-pair-dialog"><form method="dialog"><button class="dialog-close" aria-label="닫기">×</button></form><p class="eyebrow">QR CAMERA</p><h2>관리카메라 추가</h2><canvas id="managementCameraQr" width="196" height="196" aria-label="관리카메라 연결 QR"></canvas><p class="pair-copy">QR을 찍고 승인합니다.</p><input id="managementCameraUrl" readonly aria-label="관리카메라 연결 주소"><div class="pair-actions"><button id="copyManagementCameraUrlButton" type="button">링크 복사</button><button id="newManagementCameraPairButton" type="button">새 QR</button></div><div id="managementCameraPairs" class="pair-list"></div></dialog>
${shellScript}<script src="/tenant-live.js" defer></script></body></html>`;
  const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  if(tenant.robots)headers['x-robots-tag']=String(tenant.robots);
  if(tenant.route)headers['x-ekodi-route']=String(tenant.route);
  if(tenant.publicationStatus)headers['x-ekodi-publication-status']=String(tenant.publicationStatus);
  if(tenant.independentSite)headers['x-ekodi-independent-site']='true';
  if(tenant.workspace)headers['x-ekodi-workspace']=String(tenant.workspace);
  return new Response(body,{status:200,headers});
}

export function managementCameraPage(pairCode){
  const code=esc(pairCode);
  const body=`<!doctype html><html lang="ko-KR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>EKODI 관리카메라</title><link rel="stylesheet" href="/tenant-live.css"></head><body class="management-camera-body" data-camera-pair="${code}"><main class="management-camera-shell"><p class="eyebrow">EKODI LIVE</p><h1>관리카메라</h1><video id="managementCameraPreview" autoplay playsinline muted></video><div class="management-camera-controls"><button id="managementCameraSwitch" type="button">전·후면</button><button id="managementCameraConnect" class="primary" type="button">카메라 연결</button></div><p id="managementCameraDeviceStatus" class="status">대기</p></main><script src="/tenant-live.js" defer></script></body></html>`;
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer'}});
}
