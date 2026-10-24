(() => {
  'use strict';

  const TAB_KEY = 'channels';
  const API = '/marketing-connect-api';
  const STYLE_ID = 'marketingGrowthConnectorStyle';
  let loading = false;
  let installed = false;
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const esc = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const dateText = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const stateLabel = value => ({active:'연결됨',expired:'만료',revoked:'해제',error:'오류',paused:'중지',draft:'초안',ready:'승인됨',completed:'완료',failed:'실패',approved:'승인',rejected:'거절'})[String(value || '').toLowerCase()] || String(value || '확인중');
  const providerLabel = value => ({facebook:'Facebook',instagram:'Instagram',threads:'Threads',youtube:'YouTube',facebook_ads:'Meta 광고'})[String(value || '').toLowerCase()] || String(value || '채널');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .growth-hub{display:grid;gap:14px;font-size:14px;line-height:1.6;color:#172033}
      .growth-hero,.growth-card,.growth-summary article{border:1px solid #d9e3ec;border-radius:12px;background:#ffffff}
      .growth-hero{padding:18px 20px;display:grid;gap:8px}.growth-hero h3{margin:0;color:#172033;font-size:20px;line-height:1.35}.growth-hero p{margin:0;color:#41556a;font-size:14px;line-height:1.7}
      .growth-chip{display:inline-flex;width:max-content;padding:4px 10px;border:1px solid #9fd3bf;border-radius:999px;background:#eaf7f1;color:#1d6b52;font-size:12.5px;font-weight:800}
      .growth-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.growth-summary article{padding:14px 16px}.growth-summary small{display:block;color:#53687c;font-size:13px}.growth-summary strong{display:block;margin-top:4px;color:#172033;font-size:24px;line-height:1.2}
      .growth-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:1px solid #d9e3ec;border-radius:12px;background:#f4f8fb}
      .growth-tab{min-height:40px;padding:0 16px;border:1px solid transparent;border-radius:9px;background:transparent;color:#41556a;font-size:15px;font-weight:700;cursor:pointer}
      .growth-tab:hover{background:#e8f0f7}.growth-tab[aria-selected="true"]{border-color:#9db7cc;background:#ffffff;color:#173a57;box-shadow:0 1px 3px rgba(23,58,87,.12)}
      .growth-tab .growth-count{margin-left:6px;padding:1px 8px;border-radius:999px;background:#e3ecf4;color:#173a57;font-size:12.5px}
      .growth-pane{display:grid;gap:12px}.growth-pane[hidden]{display:none}
      .growth-connectors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .growth-card{padding:18px 20px}.growth-card h4{margin:0 0 8px;color:#172033;font-size:17px;line-height:1.4}.growth-card p{margin:0 0 12px;color:#41556a;font-size:14px;line-height:1.7}
      .growth-card button,.growth-form button,.growth-action{min-height:42px;padding:0 18px;border:1px solid #9db7cc;border-radius:9px;background:#eef4f9;color:#173a57;font-size:15px;font-weight:800;cursor:pointer}
      .growth-card button.primary,.growth-form button[type="submit"]{border-color:#1f5f9a;background:#1f5f9a;color:#ffffff}
      .growth-card button:disabled,.growth-form button:disabled{opacity:.45;cursor:not-allowed}
      .growth-grid{display:grid;grid-template-columns:1fr;gap:12px}.growth-card header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
      .growth-state{display:inline-flex;padding:3px 10px;border:1px solid #c3d1dd;border-radius:999px;color:#41556a;font-size:12.5px;font-weight:800;white-space:nowrap}
      .growth-state.active,.growth-state.ready,.growth-state.approved{border-color:#9fd3bf;background:#eaf7f1;color:#1d6b52}.growth-state.failed,.growth-state.error{border-color:#e6b3b7;background:#fdf0f1;color:#a33b44}.growth-state.draft,.growth-state.paused{border-color:#e7cf9f;background:#fff7e8;color:#8a5a12}
      .growth-account{display:grid;gap:4px;margin:0 0 12px;padding:12px 14px;border:1px solid #b9dccd;border-radius:10px;background:#eef8f4;font-size:14px}.growth-account.none{border-color:#d9e3ec;background:#f7fafc;color:#53687c}
      .growth-account b{color:#172033}.growth-account span{color:#1f5a49}
      .growth-list{display:grid;gap:8px;margin-top:8px}.growth-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding:12px 14px;border:1px solid #e1e9f0;border-radius:10px;background:#f7fafc}
      .growth-row strong{display:block;color:#172033;font-size:15.5px}.growth-row span,.growth-row small,.growth-row a{color:#53687c;font-size:13.5px}
      .growth-row .growth-email{color:#173a57;font-weight:700}.growth-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px}
      .growth-empty{padding:16px;border:1px dashed #c3d1dd;border-radius:10px;color:#53687c;font-size:14px;line-height:1.7}
      .growth-form{display:grid;gap:12px;margin-top:8px}.growth-form label{display:grid;gap:6px;color:#2f4357;font-size:14px;font-weight:700}
      .growth-form input,.growth-form textarea,.growth-form select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #c3d1dd;border-radius:9px;background:#ffffff;color:#172033;font-size:15px;font-weight:400}
      .growth-form textarea{min-height:120px;resize:vertical}.growth-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.growth-full{grid-column:1/-1}
      .growth-checks{display:grid;gap:8px}.growth-check{display:flex!important;flex-direction:row;align-items:center;gap:10px!important;padding:10px 12px;border:1px solid #e1e9f0;border-radius:9px;background:#f7fafc;font-size:14.5px!important}.growth-check input{width:18px;height:18px}
      .growth-note{padding:12px 14px;border:1px solid #b9dccd;border-radius:10px;background:#eef8f4;color:#1f5a49;font-size:14px;line-height:1.7}
      .growth-result{min-height:22px;color:#2f5f86;font-size:14px}.growth-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .growth-platform-alert{padding:14px 16px;border:1px solid #e7cf9f;border-radius:10px;background:#fff7e8;color:#6d4210;font-size:14.5px;line-height:1.7}.growth-platform-alert b{display:block;margin-bottom:2px;font-size:15.5px}
      .growth-platform-alert.error{border-color:#e6b3b7;background:#fdf0f1;color:#8a2f37}
      .growth-platform-alert code{font-size:12.5px;color:#7a5a5e}
      @media(max-width:1080px){.growth-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.growth-connectors,.growth-summary,.growth-form-grid{grid-template-columns:1fr}.growth-full{grid-column:auto}.growth-tab{flex:1 1 calc(50% - 6px)}}
    `;
    style.textContent += `
      .board h5{margin:18px 0 6px;font-size:13px}
      .board-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
      .board-tile{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:10px}
      .board-tile small,.board-tile span{display:block;font-size:12px;opacity:.75}.board-tile strong{display:block;font-size:22px;margin:2px 0}
      .board-svg{width:100%;height:auto;display:block;--board-surface:#fff}
      @media (prefers-color-scheme: dark){.board-svg{--board-surface:#1a1a19}}
      .board-grid{stroke:currentColor;opacity:.12}.board-track{stroke:currentColor;opacity:.18;stroke-width:2}.board-now{stroke:currentColor;opacity:.55;stroke-dasharray:3 3}
      .board-axis{fill:currentColor;opacity:.6;font-size:11px}.board-label{fill:currentColor;font-size:12px}
      .board-legend{display:flex;gap:14px;font-size:12px;margin:6px 0}.board-legend i,.board-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
      .board-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.board-table th,.board-table td{text-align:left;padding:6px;border-bottom:1px solid rgba(127,127,127,.18)}
    `;
    document.head.append(style);
  }

  function endpoint(path) {
    const url = new URL(`${API}${path}`, location.origin);
    // 플랫폼 관제센터의 채널은 에코디몰 자율 홍보 엔진(tenant: ekodimall)이 쓰는 주체로 저장한다.
    url.searchParams.set('subject_type','tenant');
    url.searchParams.set('subject_key','ekodimall');
    return url.href;
  }
  async function request(path,{method='GET',body}={}) {
    const headers = new Headers();
    if (token()) headers.set('authorization',`Bearer ${token()}`);
    if (body !== undefined) headers.set('content-type','application/json');
    const response = await fetch(endpoint(path),{method,headers,body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.detail || data.error || `요청 실패 (${response.status})`);
      error.data = data;
      throw error;
    }
    return data;
  }
  function currentReturnUrl() {
    const url = new URL(location.href);
    ['ekodi_connect','provider','connections','reason'].forEach(key => url.searchParams.delete(key));
    return url.href;
  }
  const REASON_TEXT = {
    GOOGLE_OAUTH_EXCHANGE_FAILED:['Google 인증 마무리 단계에서 실패했습니다.','Google 로그인은 통과했지만 에코디가 연결 토큰을 받지 못해 계정이 저장되지 않았습니다. 다시 한 번 연결을 눌러 주세요. 반복되면 Google Cloud OAuth 클라이언트 설정 확인이 필요합니다.'],
    GOOGLE_OAUTH_INVALID_CLIENT:['Google OAuth 클라이언트 정보가 맞지 않습니다.','Google Cloud의 클라이언트 ID와 에코디에 저장된 클라이언트 보안 비밀번호가 서로 다릅니다. 클라이언트를 새로 만들었거나 보안 비밀번호를 바꿨다면 에코디 쪽 값도 같이 갱신해야 합니다.'],
    GOOGLE_OAUTH_UNAUTHORIZED_CLIENT:['이 Google 클라이언트는 이 방식의 인증을 허용하지 않습니다.','Google Cloud에서 클라이언트 유형이 “웹 애플리케이션”인지 확인해 주세요.'],
    GOOGLE_OAUTH_REDIRECT_MISMATCH:['Google에 등록된 리디렉션 주소가 다릅니다.','Google Cloud 클라이언트의 “승인된 리디렉션 URI”에 에코디 콜백 주소가 있어야 합니다.'],
    GOOGLE_OAUTH_CODE_INVALID:['인증 코드가 만료되었거나 이미 사용되었습니다.','새로고침하지 말고 연결 버튼을 다시 눌러 처음부터 진행해 주세요.'],
    GOOGLE_OAUTH_CLIENT_DELETED:['Google OAuth 클라이언트가 삭제된 상태입니다.','Google Cloud 콘솔의 “삭제된 사용자 인증 정보”에서 복원해 주세요.'],
    GOOGLE_OAUTH_TICKET_STORE_FAILED:['토큰은 받았지만 에코디 보관 단계에서 실패했습니다.','에코디 내부 저장소 문제입니다. 잠시 후 다시 시도하고, 반복되면 운영 점검이 필요합니다.'],
    GOOGLE_OAUTH_ACCESS_DENIED:['Google 권한 승인이 취소되었습니다.','동의 화면에서 “허용”을 눌러야 연결됩니다. Google OAuth 앱이 테스트 모드라면 로그인한 계정을 테스트 사용자로 추가해야 합니다.'],
    YOUTUBE_REFRESH_TOKEN_MISSING:['Google이 장기 연결 토큰을 주지 않았습니다.','https://myaccount.google.com/permissions 에서 이 앱 권한을 삭제한 뒤 다시 연결해 주세요.'],
    YOUTUBE_TARGET_ACCOUNT_MISMATCH:['지정한 계정과 다른 Google 계정으로 로그인했습니다.','계정 선택 화면에서 연결하려는 계정을 골라 주세요.'],
    AUTHORIZATION_CODE_MISSING:['Google에서 인증 코드를 받지 못했습니다.','연결 버튼을 다시 눌러 처음부터 진행해 주세요.'],
  };
  function reasonText(reason) {
    const raw = String(reason || '').trim();
    if (raw.startsWith('YOUTUBE_DATA_API_DISABLED')) return ['YouTube Data API가 꺼져 있습니다.','Google Cloud 프로젝트에서 YouTube Data API v3를 사용 설정해 주세요.'];
    return REASON_TEXT[raw] || ['계정 인증을 완료하지 못했습니다.', raw ? '' : '권한 또는 앱 설정을 확인하세요.'];
  }
  function callbackNotice() {
    const url = new URL(location.href);
    const status = url.searchParams.get('ekodi_connect');
    if (!status) return '';
    const provider = url.searchParams.get('provider') || '계정';
    if (status === 'success') {
      const count = Number(url.searchParams.get('connections') || 0);
      return `<div class="growth-note"><b>${esc(providerLabel(provider))} 연결 완료</b> · ${count ? `${count}개 채널을 연결했습니다.` : '인증이 완료되었습니다.'} 아래 “연결된 계정” 탭에서 어떤 계정으로 연결됐는지 확인할 수 있습니다.</div>`;
    }
    const reason = url.searchParams.get('reason') || '';
    const [title, detail] = reasonText(reason);
    return `<div class="growth-platform-alert error"><b>${esc(providerLabel(provider))} 연결 실패 — ${esc(title)}</b>${detail ? esc(detail) : ''}${reason ? `<br><code>오류 코드: ${esc(reason)}</code>` : ''}</div>`;
  }
  function accountEmail(row) {
    const meta = row.metadata || {};
    const email = String(meta.authorizedEmail || meta.email || meta.targetAccount || '').trim();
    // Google returns an internal pages.plusgoogle.com identity for YouTube brand accounts.
    return /@pages\.plusgoogle\.com$/i.test(email) ? 'Google 브랜드 계정' : email;
  }
  function providerAccountSummary(connections, providers) {
    const rows = connections.filter(row => providers.includes(row.provider) && row.status === 'active');
    if (!rows.length) return '<div class="growth-account none">아직 연결된 계정이 없습니다.</div>';
    return `<div class="growth-account">${rows.map(row => {
      const email = accountEmail(row);
      return `<div><b>${esc(row.display_name || providerLabel(row.provider))}</b>${email ? ` <span>· 로그인 계정 ${esc(email)}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }
  // EKODI-MALL-PROMOTION-BOARD-001: 자동 홍보 통합 상황판(그래픽). 제휴=슬롯1(파랑), 직접판매=슬롯2(주황) — 검증된 기본 팔레트.
  const LANE = { affiliate: { label: '제휴(쿠팡 파트너스)', color: '#2a78d6' }, direct: { label: '직접판매', color: '#eb6834' } };
  const PROVIDER_LABEL = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', youtube: 'YouTube' };
  const STATE_LABEL = { scheduled: '예약', pending: '대기', publishing: '게시 중', published: '게시됨', failed: '실패', planned: '계획' };
  function boardView(board) {
    if (!board || !board.ok) return '<section class="growth-card"><h4>자동 홍보 상황판</h4><div class="growth-empty">상황판 데이터를 아직 불러올 수 없습니다. 잠시 후 다시 확인하세요.</div></section>';
    const won = n => `${Number(n || 0).toLocaleString('ko-KR')}`;
    const tiles = [['14일 게시', won(board.totals.affiliate + board.totals.direct), `제휴 ${won(board.totals.affiliate)} · 직접 ${won(board.totals.direct)}`],
      ['14일 실패', won(board.totals.failed), board.totals.failed ? '활동 내역 확인' : '정상'],
      ['30일 방문', won(board.funnel30d.visits), `쿠팡 이동 ${won(board.funnel30d.outboundClicks)}`],
      ['30일 수수료', `${won(board.funnel30d.commissionKrw)}원`, `주문 ${won(board.funnel30d.orders)}건`]]
      .map(([k, v, s]) => `<article class="board-tile"><small>${esc(k)}</small><strong>${esc(v)}</strong><span>${esc(s)}</span></article>`).join('');
    return `<section class="growth-card board">
      <header><h4>자동 홍보 상황판</h4><span class="growth-state ${board.policy.mode === 'autonomous' ? 'active' : 'draft'}">${esc(board.policy.mode === 'autonomous' ? `자율 운영 · 하루 최대 ${board.policy.maxDailyPosts}건` : '검토 모드')}</span></header>
      <p>에코디몰 제휴상품과 직접판매 상품을 날짜·채널마다 다른 시각(09:00~21:30)에 자동 게시합니다. 마지막 집계 ${esc(new Date(board.generatedAt).toLocaleString('ko-KR'))}</p>
      <div class="board-tiles">${tiles}</div>
      <h5>오늘(${esc(board.today)}) 게시 일정</h5>${timelineSvg(board)}
      <h5>최근 14일 채널 게시 추이</h5>${seriesSvg(board.series)}
      <div class="board-legend">${Object.values(LANE).map(l => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('')}</div>
      <details><summary>표로 보기</summary><table class="board-table"><thead><tr><th>날짜</th><th>제휴</th><th>직접판매</th><th>실패</th></tr></thead><tbody>${board.series.map(d => `<tr><td>${esc(d.date)}</td><td>${d.affiliate}</td><td>${d.direct}</td><td>${d.failed}</td></tr>`).join('')}</tbody></table></details>
      <h5>채널 상태</h5><table class="board-table"><thead><tr><th>채널</th><th>계정</th><th>상태</th><th>14일 게시</th><th>토큰 만료</th></tr></thead><tbody>${(board.channels || []).map(c => `<tr><td>${esc(PROVIDER_LABEL[c.provider] || c.provider)}</td><td>${esc(c.name)}</td><td>${c.status === 'active' ? '● 정상' : `▲ ${esc(c.status)}`}</td><td>${c.published14d}</td><td>${esc(c.expiresAt ? c.expiresAt.slice(0, 10) : '-')}</td></tr>`).join('') || '<tr><td colspan="5">연결된 채널이 없습니다.</td></tr>'}</tbody></table>
      <h5>최근 게시</h5><div class="growth-list">${(board.recent || []).map(r => `<article class="growth-row"><div><strong>${esc(r.productName || '상품')}</strong><div class="growth-meta"><span><i class="board-dot" style="background:${(LANE[r.lane] || LANE.affiliate).color}"></i>${esc((LANE[r.lane] || LANE.affiliate).label)} · ${esc(PROVIDER_LABEL[r.provider] || r.provider)} · ${esc(r.date)} · ${esc(STATE_LABEL[r.status] || r.status)}</span></div>${r.error ? `<div class="growth-meta">${esc(r.error)}</div>` : ''}</div>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">게시물 보기 ↗</a>` : ''}</article>`).join('') || '<div class="growth-empty">아직 게시 기록이 없습니다. 첫 게시는 오늘 예약 시각에 실행됩니다.</div>'}</div>
    </section>`;
  }
  function timelineSvg(board) {
    const W = 640, H = 34 + (board.schedule || []).length * 34, x0 = 96, x1 = W - 16, start = 540, end = 1290;
    const x = m => x0 + (Math.min(end, Math.max(start, m)) - start) / (end - start) * (x1 - x0);
    const ticks = [540, 720, 900, 1080, 1260].map(m => `<line x1="${x(m)}" x2="${x(m)}" y1="18" y2="${H - 6}" class="board-grid"/><text x="${x(m)}" y="12" text-anchor="middle" class="board-axis">${String(Math.floor(m / 60)).padStart(2, '0')}:00</text>`).join('');
    const rows = (board.schedule || []).map((r, i) => { const y = 34 + i * 34; const lane = LANE[r.lane] || LANE.affiliate; const has = Number.isFinite(r.slotMinute);
      return `<g><title>${esc(PROVIDER_LABEL[r.provider] || r.provider)} ${esc(r.slotKst)} · ${esc(lane.label)} · ${esc(STATE_LABEL[r.state] || r.state)}</title><text x="0" y="${y + 4}" class="board-label">${esc(PROVIDER_LABEL[r.provider] || r.provider)}</text><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" class="board-track"/>${has ? `<circle cx="${x(r.slotMinute)}" cy="${y}" r="7" fill="${lane.color}" stroke="var(--board-surface,#fff)" stroke-width="2"/><text x="${x(r.slotMinute) + 11}" y="${y + 4}" class="board-label">${esc(r.slotKst)} ${esc(STATE_LABEL[r.state] || '')}</text>` : ''}</g>`; }).join('');
    const now = Number(board.nowMinute);
    const nowLine = now >= start && now <= end ? `<line x1="${x(now)}" x2="${x(now)}" y1="18" y2="${H - 6}" class="board-now"/><text x="${x(now)}" y="${H}" text-anchor="middle" class="board-axis">지금</text>` : '';
    return `<svg class="board-svg" viewBox="0 0 ${W} ${H + 6}" role="img" aria-label="오늘 채널별 게시 예약 시각">${ticks}${rows}${nowLine}</svg>`;
  }
  function seriesSvg(series = []) {
    const W = 640, H = 180, left = 28, bottom = 22, top = 10, n = series.length || 1, band = (W - left) / n, bw = Math.max(6, band - 8);
    const max = Math.max(1, ...series.map(d => d.affiliate + d.direct));
    const y = v => top + (H - bottom - top) * (1 - v / max);
    const grid = [0, Math.ceil(max / 2), max].map(v => `<line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="board-grid"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end" class="board-axis">${v}</text>`).join('');
    const bars = series.map((d, i) => { const bx = left + i * band + (band - bw) / 2; const ya = y(d.affiliate); const yd = y(d.affiliate + d.direct);
      const aff = d.affiliate ? `<rect x="${bx}" y="${ya}" width="${bw}" height="${Math.max(0, y(0) - ya)}" rx="3" fill="${LANE.affiliate.color}"/>` : '';
      const dir = d.direct ? `<rect x="${bx}" y="${yd}" width="${bw}" height="${Math.max(0, ya - yd - (d.affiliate ? 2 : 0))}" rx="3" fill="${LANE.direct.color}"/>` : '';
      return `<g><title>${esc(d.date)} · 제휴 ${d.affiliate} · 직접판매 ${d.direct}${d.failed ? ` · 실패 ${d.failed}` : ''}</title><rect x="${left + i * band}" y="${top}" width="${band}" height="${H - bottom - top}" fill="transparent"/>${aff}${dir}${(n - 1 - i) % 2 === 0 ? `<text x="${bx + bw / 2}" y="${H - 6}" text-anchor="middle" class="board-axis">${esc(d.date.slice(5))}</text>` : ''}</g>`; }).join('');
    return `<svg class="board-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 14일 제휴·직접판매 게시 수">${grid}${bars}</svg>`;
  }

  function connectionRows(connections) {
    if (!connections.length) return '<div class="growth-empty">아직 연결된 계정이 없습니다. 인증키나 Page ID를 입력하지 말고 “연결하기” 탭의 버튼으로 공식 로그인만 진행하면 됩니다.</div>';
    return `<div class="growth-list">${connections.map(row => {
      const email = accountEmail(row);
      return `<article class="growth-row"><div><strong>${esc(row.display_name || providerLabel(row.provider))}</strong><div class="growth-meta"><span>${esc(providerLabel(row.provider))} ${row.provider === 'youtube' ? '채널' : esc(row.resource_type || '')}</span>${email ? `<span class="growth-email">로그인 계정: ${esc(email)}</span>` : ''}<small>ID ${esc(row.external_id)}</small><small>확인 ${esc(dateText(row.last_check_at || row.updated_at))}</small></div>${row.last_error ? `<small>${esc(row.last_error)}</small>` : ''}</div><span class="growth-state ${esc(row.status)}">${esc(stateLabel(row.status))}</span></article>`;
    }).join('')}</div>`;
  }
  function channelChecks(connections) {
    const rows = connections.filter(row => ['facebook','instagram','threads','youtube'].includes(row.provider) && row.status === 'active');
    if (!rows.length) return '<div class="growth-empty">게시할 계정을 먼저 연결하세요.</div>';
    return `<div class="growth-checks">${rows.map(row => `<label class="growth-check"><input type="checkbox" name="connectionIds" value="${Number(row.id)}" checked><span>${esc(providerLabel(row.provider))} · ${esc(row.display_name)}</span></label>`).join('')}</div>`;
  }
  function adOptions(connections) {
    const rows = connections.filter(row => row.provider === 'facebook_ads' && row.status === 'active');
    if (!rows.length) return '<option value="">광고계정 연결 필요</option>';
    return `<option value="">광고계정 선택</option>${rows.map(row => `<option value="${Number(row.id)}">${esc(row.display_name)} · ${esc(row.external_id)}</option>`).join('')}`;
  }
  function campaignRows(campaigns) {
    if (!campaigns.length) return '<div class="growth-empty">아직 홍보 캠페인이 없습니다. 무료 홍보는 즉시 게시할 수 있고, 유료 홍보는 먼저 초안으로 저장됩니다.</div>';
    return `<div class="growth-list">${campaigns.slice(0,20).map(row => `<article class="growth-row"><div><strong>${esc(row.name)}</strong><div class="growth-meta"><span>${row.mode === 'paid' ? '유료 홍보' : '무료 홍보'}</span><span>${row.mode === 'paid' ? `${esc(money(row.daily_budget_krw))}/일 · 총 ${esc(money(row.total_budget_krw))}` : esc(row.utm_campaign || '')}</span><small>${esc(dateText(row.updated_at))}</small></div>${row.last_error ? `<small>${esc(row.last_error)}</small>` : ''}${row.external_campaign_id ? `<small>Meta Campaign ${esc(row.external_campaign_id)} · PAUSED</small>` : ''}${row.mode === 'paid' && row.approval_state === 'draft' ? `<div class="growth-actions"><button class="growth-action" type="button" data-approve-campaign="${Number(row.id)}">광고비 승인</button></div>` : ''}${row.mode === 'paid' && row.approval_state === 'approved' && !row.external_campaign_id ? `<div class="growth-actions"><button class="growth-action" type="button" data-prepare-campaign="${Number(row.id)}">Meta에 PAUSED 생성</button></div>` : ''}</div><span class="growth-state ${esc(row.status)}">${esc(stateLabel(row.status))}</span></article>`).join('')}</div>`;
  }

  async function connect(provider,mode='publish') {
    const path = provider === 'threads' ? '/v1/connect/threads/start' : provider === 'youtube' ? '/v1/connect/youtube/start' : '/v1/connect/meta/start';
    const data = await request(path,{method:'POST',body:{mode,returnUrl:currentReturnUrl()}});
    if (!data.authorizationUrl) throw new Error('인증 주소를 받지 못했습니다.');
    location.assign(data.authorizationUrl);
  }
  const TAB_STORE = 'ekodi-growth-tab';
  function readTab() { try { return sessionStorage.getItem(TAB_STORE) || ''; } catch { return ''; } }
  function writeTab(key) { try { sessionStorage.setItem(TAB_STORE,key); } catch {} }
  function selectedIds(form) { return [...form.querySelectorAll('input[name="connectionIds"]:checked')].map(input => Number(input.value)).filter(Number.isInteger); }
  function formValue(form,name) { return String(new FormData(form).get(name) || '').trim(); }
  function setResult(form,message,error=false) {
    const node = form.querySelector('.growth-result');
    if (node) { node.textContent = message; node.style.color = error ? '#a33b44' : '#2f5f86'; }
  }

  async function renderManager() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    const tab = panel?.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    const view = panel?.querySelector('#marketingAiConsoleView');
    if (!panel || !tab || !view || !tab.classList.contains('active') || loading) return;
    if (tab.textContent !== '게시 · 홍보') tab.textContent = '게시 · 홍보';
    ensureStyles();
    loading = true;
    view.innerHTML = '<div class="growth-empty" data-growth-manager>게시·홍보 연결상태를 확인하는 중입니다.</div>';
    try {
      if (!token()) throw new Error('관리자 로그인이 필요합니다.');
      const [connectionData,campaignData,board] = await Promise.all([request('/v1/connections'),request('/v1/promotions'),request('/v1/mall/promotion-board').catch(() => null)]);
      const connections = Array.isArray(connectionData.connections) ? connectionData.connections : [];
      const campaigns = Array.isArray(campaignData.campaigns) ? campaignData.campaigns : [];
      const activePublish = connections.filter(row => ['facebook','instagram','threads','youtube'].includes(row.provider) && row.status === 'active').length;
      const adAccounts = connections.filter(row => row.provider === 'facebook_ads' && row.status === 'active').length;
      const organic = campaigns.filter(row => row.mode === 'organic').length;
      const paid = campaigns.filter(row => row.mode === 'paid').length;
      const platform = connectionData.platform || {};
      const platformAlert = (!platform.metaConfigured || !platform.threadsConfigured || !platform.youtubeConfigured) ? `<div class="growth-platform-alert"><b>최초 1회 플랫폼 설정 필요</b><br>사용자별 인증키 입력은 없앴습니다. 다만 에코디 전체가 사용할 공식 앱 식별정보가 아직 등록되지 않은 서비스는 연결 버튼이 잠깁니다. Meta·Google 앱 설정은 시스템 전체에서 한 번만 완료하면 이후 모든 사용자는 공식 계정 로그인과 권한 승인만 합니다.</div>` : '';

      const notice = callbackNotice();
      const callbackStatus = new URL(location.href).searchParams.get('ekodi_connect');
      const tabs = [['board','상황판',0],['connect','연결하기',0],['accounts','연결된 계정',connections.length],['organic','무료 게시',organic],['paid','유료 홍보',paid],['history','활동 내역',campaigns.length]];
      let activeTab = callbackStatus === 'success' ? 'accounts' : callbackStatus ? 'connect' : (readTab() || 'board');
      if (!tabs.some(([key]) => key === activeTab)) activeTab = 'connect';
      const tabButton = ([key,label,count]) => `<button type="button" class="growth-tab" role="tab" id="growthTab-${key}" aria-controls="growthPane-${key}" aria-selected="${key === activeTab}" data-growth-tab="${key}">${label}${count ? `<span class="growth-count">${count}</span>` : ''}</button>`;
      const pane = (key,body) => `<div class="growth-pane" role="tabpanel" id="growthPane-${key}" aria-labelledby="growthTab-${key}" data-growth-pane="${key}" ${key === activeTab ? '' : 'hidden'}>${body}</div>`;
      const card = (title,configured,bodyText,accounts,button) => `<section class="growth-card"><header><h4>${title}</h4><span class="growth-state ${configured ? 'active' : 'draft'}">${configured ? '준비됨' : '앱 설정 필요'}</span></header><p>${bodyText}</p>${accounts}${button}</section>`;

      view.innerHTML = `<div class="growth-hub" data-growth-hub data-growth-manager>
        <section class="growth-hero"><span class="growth-chip">중앙 OAuth · 암호화 Vault · 무료 직접 게시</span><h3>게시 · 홍보 연결센터</h3><p>인증키, Access Token, Page ID를 복사하지 않습니다. 공식 계정으로 로그인하면 에코디가 권한·계정발견·토큰보관·게시·유입추적을 한 흐름으로 처리합니다. Metricool은 필수가 아닙니다.</p></section>
        ${notice}${platformAlert}
        <div class="growth-summary"><article><small>게시 연결</small><strong>${activePublish}</strong></article><article><small>광고계정</small><strong>${adAccounts}</strong></article><article><small>무료 홍보</small><strong>${organic}</strong></article><article><small>유료 초안</small><strong>${paid}</strong></article></div>
        <div class="growth-tabs" role="tablist" aria-label="게시·홍보 메뉴">${tabs.map(tabButton).join('')}</div>
        ${pane('board',boardView(board))}
        ${pane('connect',`<div class="growth-connectors">
          ${card('Meta 통합 연결',platform.metaConfigured,'Facebook 페이지와 연결된 Instagram 비즈니스 계정을 한 번의 Meta 승인으로 자동 검색·연결합니다.',providerAccountSummary(connections,['facebook','instagram']),`<button type="button" class="primary" data-connect="meta" ${platform.metaConfigured ? '' : 'disabled'}>Meta로 계속</button>`)}
          ${card('Threads 연결',platform.threadsConfigured,'Threads 공식 로그인으로 프로필을 연결합니다. 토큰은 암호화 Vault에만 보관됩니다.',providerAccountSummary(connections,['threads']),`<button type="button" class="primary" data-connect="threads" ${platform.threadsConfigured ? '' : 'disabled'}>Threads로 계속</button>`)}
          ${card('YouTube 연결',platform.youtubeConfigured,'Google 계정으로 로그인해 YouTube 채널을 연결합니다. 브랜드 계정 채널은 Google 계정 선택 다음의 “채널 선택” 화면에서 고르면 됩니다.',providerAccountSummary(connections,['youtube']),`<button type="button" class="primary" data-connect="youtube" ${platform.youtubeConfigured ? '' : 'disabled'}>Google로 YouTube 연결</button>`)}
          <section class="growth-card"><header><h4>유료 홍보 권한</h4><span class="growth-state ${adAccounts ? 'active' : 'draft'}">${adAccounts ? `${adAccounts} 계정` : '선택 연결'}</span></header><p>Meta 광고계정 권한을 연결합니다. 광고 캠페인은 승인 후에도 PAUSED로만 생성해 예기치 않은 과금을 막습니다.</p>${providerAccountSummary(connections,['facebook_ads'])}<button type="button" data-connect-paid ${platform.metaConfigured ? '' : 'disabled'}>Meta 광고계정 연결</button></section>
        </div>`)}
        ${pane('accounts',`<section class="growth-card"><h4>연결된 계정</h4><p>각 채널이 어떤 로그인 계정으로 연결됐는지 보여 줍니다.</p>${connectionRows(connections)}</section>`)}
        ${pane('organic',`<section class="growth-card"><h4>무료 게시 · 홍보 실행</h4><p>연결 채널을 고르면 UTM을 자동 부착해 실제 게시하고, 성공·실패 URL을 에코디에 기록합니다.</p><form class="growth-form" data-organic-form>${channelChecks(connections)}<div class="growth-form-grid"><label class="growth-full">캠페인 이름<input name="name" required maxlength="120" placeholder="예: 에코디몰 오늘의 발견"></label><label class="growth-full">게시문<textarea name="caption" required maxlength="12000" placeholder="홍보 문구"></textarea></label><label>유입 링크<input name="targetUrl" type="url" placeholder="https://ekodi.kr/ekodibiz/ekodimall"></label><label>미디어 URL<input name="imageUrl" type="url" placeholder="Instagram은 이미지 · YouTube는 MP4 영상"></label></div><div class="growth-note">무료 홍보는 광고비 0원입니다. Facebook·Instagram·Threads·YouTube마다 UTM source를 자동 구분해 유입을 추적합니다.</div><button type="submit" ${activePublish ? '' : 'disabled'}>게시 · 무료 홍보 실행</button><div class="growth-result"></div></form></section>`)}
        ${pane('paid',`<section class="growth-card"><h4>유료 홍보 초안</h4><p>예산·목표만 먼저 기록합니다. 초안 생성만으로는 1원도 집행되지 않습니다.</p><form class="growth-form" data-paid-form><div class="growth-form-grid"><label class="growth-full">광고계정<select name="adAccountConnectionId" required>${adOptions(connections)}</select></label><label class="growth-full">캠페인 이름<input name="name" required maxlength="120" placeholder="예: 에코디몰 유입 캠페인"></label><label class="growth-full">목표 URL<input name="targetUrl" required type="url" placeholder="https://ekodi.kr/ekodibiz/ekodimall"></label><label>일 예산<input name="dailyBudgetKrw" required type="number" min="1000" step="1000" value="5000"></label><label>총 예산<input name="totalBudgetKrw" required type="number" min="1000" step="1000" value="30000"></label><label class="growth-full">광고 문안<textarea name="caption" maxlength="12000" placeholder="광고 소재 문안"></textarea></label></div><div class="growth-note">안전장치: 초안 → 명시적 광고비 승인 → Meta에 PAUSED 캠페인 생성. 현재 자동 활성화는 의도적으로 막아두었습니다.</div><button type="submit" ${adAccounts ? '' : 'disabled'}>유료 홍보 초안 만들기</button><div class="growth-result"></div></form></section>`)}
        ${pane('history',`<section class="growth-card"><h4>홍보 활동 내역</h4>${campaignRows(campaigns)}</section>`)}
      </div>`;

      view.querySelectorAll('[data-growth-tab]').forEach(button => button.addEventListener('click',() => {
        const key = button.dataset.growthTab;
        writeTab(key);
        view.querySelectorAll('[data-growth-tab]').forEach(node => node.setAttribute('aria-selected',String(node === button)));
        view.querySelectorAll('[data-growth-pane]').forEach(node => { node.hidden = node.dataset.growthPane !== key; });
      }));
      view.querySelector('[data-connect="meta"]')?.addEventListener('click',() => connect('meta').catch(error => alert(error.message)));
      view.querySelector('[data-connect="threads"]')?.addEventListener('click',() => connect('threads').catch(error => alert(error.message)));
      view.querySelector('[data-connect="youtube"]')?.addEventListener('click',() => connect('youtube').catch(error => alert(error.message)));
      view.querySelector('[data-connect-paid]')?.addEventListener('click',() => connect('meta','paid').catch(error => alert(error.message)));
      view.querySelector('[data-organic-form]')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        setResult(form,'실제 게시와 추적 링크를 생성하는 중입니다.');
        try {
          const body = {mode:'organic',name:formValue(form,'name'),targetUrl:formValue(form,'targetUrl'),connectionIds:selectedIds(form),executeNow:true,content:{caption:formValue(form,'caption'),imageUrl:formValue(form,'imageUrl'),linkUrl:formValue(form,'targetUrl')}};
          const data = await request('/v1/promotions',{method:'POST',body});
          const results = data.publication?.results || [];
          const success = results.filter(row => row.status === 'published').length;
          const failed = results.filter(row => row.status === 'failed').length;
          setResult(form,`게시 완료 ${success}건${failed ? ` · 실패 ${failed}건` : ''}. 활동 내역을 새로 불러옵니다.`);
          setTimeout(() => { loading = false; renderManager(); },500);
        } catch (error) { setResult(form,error.message,true); button.disabled = false; }
      });
      view.querySelector('[data-paid-form]')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        setResult(form,'광고비가 발생하지 않는 초안을 저장하는 중입니다.');
        try {
          const body = {mode:'paid',name:formValue(form,'name'),targetUrl:formValue(form,'targetUrl'),objective:'traffic',dailyBudgetKrw:Number(formValue(form,'dailyBudgetKrw')),totalBudgetKrw:Number(formValue(form,'totalBudgetKrw')),adAccountConnectionId:Number(formValue(form,'adAccountConnectionId')),content:{caption:formValue(form,'caption'),linkUrl:formValue(form,'targetUrl')}};
          const data = await request('/v1/promotions',{method:'POST',body});
          setResult(form,`초안 #${data.campaignId} 저장 완료 · 현재 집행액 0원`);
          setTimeout(() => { loading = false; renderManager(); },500);
        } catch (error) { setResult(form,error.message,true); button.disabled = false; }
      });
      view.querySelectorAll('[data-approve-campaign]').forEach(button => button.addEventListener('click',async () => {
        if (!confirm('이 캠페인의 광고비 집행 준비를 승인할까요? 아직 광고는 활성화되지 않습니다.')) return;
        button.disabled = true;
        try { await request(`/v1/promotions/${button.dataset.approveCampaign}/approve`,{method:'POST',body:{approvalText:'광고비 집행 승인'}}); loading = false; renderManager(); }
        catch (error) { alert(error.message); button.disabled = false; }
      }));
      view.querySelectorAll('[data-prepare-campaign]').forEach(button => button.addEventListener('click',async () => {
        button.disabled = true;
        try { const data = await request(`/v1/promotions/${button.dataset.prepareCampaign}/prepare`,{method:'POST',body:{}}); alert(`${data.note || 'Meta 캠페인 준비 완료'}\n집행액: ${money(data.spendKrw)}`); loading = false; renderManager(); }
        catch (error) { alert(error.message); button.disabled = false; }
      }));
    } catch (error) {
      view.innerHTML = `<div class="growth-platform-alert" data-growth-manager>게시·홍보 연결센터를 불러오지 못했습니다. ${esc(error.message)}</div>`;
    } finally { loading = false; }
  }

  function install() {
    if (installed) return;
    installed = true;
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('#marketingAiAdminPanel');
      if (!panel) return;
      const tab = panel.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
      // 자기 렌더(로딩·허브·오류 모두 data-growth-manager 표식)를 다시 감지해 무한 재렌더하지 않는다.
      const view = panel.querySelector('#marketingAiConsoleView');
      if (tab && tab.classList.contains('active') && !loading && view && !view.querySelector('[data-growth-manager]')) setTimeout(renderManager,0);
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('click',event => {
      const tab = event.target.closest?.(`[data-marketing-tab="${TAB_KEY}"]`);
      if (tab) setTimeout(renderManager,0);
    });
    setTimeout(renderManager,100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
