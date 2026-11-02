// MALL-SUPPLIER-ADMIN-001 — standalone Mall operator-only cross-source read view.
// Passed as a serialized pure function to the existing workspace admin client.
// No supplier credential, buyer PII, marketplace checkout or cross-seller write.
export async function renderMallSupplierAdmin({ host, summary, token, card, state, escape, format, adminBase }) {
  host.innerHTML = '<h2>공급처별 전체 상품 현황</h2><p role="status">전체 상품을 확인하고 있습니다.</p>';
  summary.replaceChildren();
  state('공급처 확인 중');
  try {
    if (!token) throw new Error('관리자 로그인이 필요합니다.');
    const response = await fetch('/ekodimall/api/internal/products/by-provider', { headers: { authorization: 'Bearer ' + token, accept: 'application/json' }, cache: 'no-store' });
    const privateData = await response.json().catch(() => ({}));
    if (!response.ok || privateData.scope !== 'operator-read-only')
      throw new Error(response.status === 403 ? '전체 공급처 상품은 등록된 에코디몰 최고관리자만 조회할 수 있습니다.' : privateData.error || '상품 데이터 조회 실패');
    const urls = ['/ekodimall/assets/provider-registry.json', '/ekodimall/provider-bookstore.json', '/api/affiliate/public/products?storefront=ekodi-mall&limit=100'];
    const results = await Promise.allSettled(urls.map(async url => {
      const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }));
    const data = index => results[index].status === 'fulfilled' ? results[index].value : null;
    const registry = (data(0)?.providers || []).filter(p => /^[a-z0-9-]+$/.test(String(p.id || '')));
    if (!registry.length) throw new Error('공급처 등록 목록 연결 실패');
    const source = p => {
      const kind = String(p.source?.kind || '');
      if (kind === 'ekodi-bookstore') return 'bookstore';
      if (kind === 'coupang_partners') return 'coupang';
      const id = String(p.supply?.provider || '').toLowerCase();
      if (id === 'domeggook' || id === 'domemae') return 'domeggook';
      if (id === 'ownerclan') return 'ownerclan';
      if (id) return 'external';
      if (kind === 'consigned_merchant') return 'merchant';
      if (p.product?.saleType === 'inquiry') return 'inquiry';
      if (p.product?.saleType === 'affiliate') {
        const link = String(p.product?.affiliateUrl || '');
        if (/(?:coupa\.ng|coupang\.com)/i.test(link)) return 'coupang';
        if (/(?:amazon\.|amzn\.to)/i.test(link)) return 'amazon';
        if (/agoda\.com/i.test(link)) return 'agoda';
        if (/trip\.com/i.test(link)) return 'tripcom';
        return 'external';
      }
      return 'own';
    };
    const rows = new Map();
    for (const p of privateData.products || []) {
      if (!p?.id) continue;
      const direct = p.product?.saleType === 'direct';
      const ready = p.status === 'published' && (!direct || p.checkoutReady);
      rows.set('mall:' + p.id, { id: 'mall:' + p.id, provider: source(p), name: p.product?.name || '상품',
        seller: p.seller?.displayName || '판매자', kind: direct ? '몰 상품' : '제휴·상담',
        status: ready ? (direct ? '판매 가능' : '외부 연결') : '상품 준비중', ready,
        link: p.publicShareLinkActive ? p.publicUrl : '' });
    }
    if (data(1)) for (const b of data(1).products || []) {
      if (!b?.id) continue;
      rows.set('book:' + b.id, { id: 'book:' + b.id, provider: 'bookstore', name: b.name || '도서', seller: '에코디서점', kind: '도서',
        status: b.saleReady ? '외부 구매 연결' : '출간 준비중', ready: Boolean(b.saleReady), link: b.detailUrl || '' });
    }
    if (data(2)) for (const c of data(2).products || []) {
      if (c?.providerKey !== 'coupang_partners' || !c.productId) continue;
      rows.set('coupang:' + c.productId, { id: 'coupang:' + c.productId, provider: 'coupang', name: c.productName || '제휴상품', seller: '쿠팡파트너스', kind: '제휴',
        status: '외부 구매 연결', ready: true, link: c.clickUrl || '' });
    }
    const all = [...rows.values()], names = new Map(registry.map(p => [p.id, p.label]));
    const count = id => all.filter(p => p.provider === id).length;
    const feedError = { bookstore: results[1].status === 'rejected', coupang: results[2].status === 'rejected' };
    summary.innerHTML = [
      card('공급처', format(registry.length), '연동 전 후보 포함'),
      card('통합 상품', format(all.length), '판매자·제휴·출판 분리'),
      card('준비중', format(all.filter(p => !p.ready).length), '실제 결제·예약 제외'),
      card('외부 구매 연결', format(all.filter(p => p.ready && (p.kind === '도서' || p.kind === '제휴')).length), '몰 결제 아님')
    ].join('');
    const tabs = '<div class="access-filter-tabs" id="mallSupplierTabs" role="tablist" aria-label="공급처별 상품">'
      + '<button type="button" class="access-filter-tab" data-provider="all" aria-pressed="true">전체 ' + format(all.length) + '</button>'
      + registry.map(p => '<button type="button" class="access-filter-tab" data-provider="' + escape(p.id) + '" aria-pressed="false">' + escape(p.label) + ' · '
        + (feedError[p.id] ? '조회 실패' : format(count(p.id))) + '</button>').join('') + '</div>';
    const readiness = registry.map(p => '<tr><td><strong>' + escape(p.label) + '</strong></td><td>' + escape(p.group) + '</td><td>'
      + (feedError[p.id] ? '조회 실패' : format(count(p.id)) + '건') + '</td><td>' + escape(p.status) + '</td></tr>').join('');
    host.innerHTML = '<h2>공급처별 전체 상품 현황</h2><p class="empty">최고관리자 조회 전용입니다. 아고다·트립닷컴 등 미연동 공급처도 후보로 표시하며, 공급계약이나 결제 승인 상태를 의미하지 않습니다.</p>' + tabs
      + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:10px 0"><label for="mallSupplierSearch">상품 검색</label><input type="search" id="mallSupplierSearch" placeholder="상품명·판매자" style="flex:1;min-width:0;max-width:340px;padding:9px;border:1px solid #ddd;border-radius:8px"><span id="mallSupplierCount" role="status"></span></div>'
      + '<div class="table-wrap"><table><thead><tr><th>상품명</th><th>공급처</th><th>판매자</th><th>유형</th><th>상태</th><th>링크</th></tr></thead><tbody id="mallSupplierRows"></tbody></table></div>'
      + '<div class="actions"><button type="button" class="button" id="mallSupplierMore">50개 더 보기</button></div>'
      + '<h2 style="margin-top:20px">공급처 등록 · 연동 현황</h2><div class="table-wrap"><table><thead><tr><th>공급처</th><th>유형</th><th>상품</th><th>연동 상태</th></tr></thead><tbody>'
      + readiness + '</tbody></table></div><p class="empty">제휴상품 구매와 여행 예약은 제공처에서 진행하며, 도매꾹 자동발주·고객정보 전달은 별도 승인 전까지 차단합니다.</p>';
    let selected = 'all', limit = 50;
    const safeLink = raw => { try { const u = new URL(String(raw || ''), location.origin); return u.origin === location.origin && /^\/(ekodimall\/|books\/|api\/affiliate\/public\/)/.test(u.pathname) ? u.href : ''; } catch { return ''; } };
    const render = () => {
      const search = String(document.querySelector('#mallSupplierSearch')?.value || '').toLocaleLowerCase('ko-KR').trim();
      const visible = all.filter(p => (selected === 'all' || p.provider === selected) && (!search || (p.name + ' ' + p.seller).toLocaleLowerCase('ko-KR').includes(search)));
      document.querySelector('#mallSupplierRows').innerHTML = visible.slice(0, limit).map(p =>
        '<tr><td><strong>' + escape(p.name) + '</strong></td><td>' + escape(names.get(p.provider) || '기타') + '</td><td>' + escape(p.seller)
        + '</td><td>' + escape(p.kind) + '</td><td>' + escape(p.status) + '</td><td>'
        + (safeLink(p.link) ? '<a href="' + escape(safeLink(p.link)) + '" rel="noopener noreferrer" target="_blank">보기</a>' : '-') + '</td></tr>'
      ).join('') || '<tr><td colspan="6">선택한 공급처의 상품이 없습니다.</td></tr>';
      document.querySelector('#mallSupplierCount').textContent = format(visible.length) + '건 · ' + format(Math.min(visible.length, limit)) + '건 표시';
      document.querySelector('#mallSupplierMore').hidden = visible.length <= limit;
      document.querySelectorAll('#mallSupplierTabs [data-provider]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.provider === selected)));
    };
    document.querySelector('#mallSupplierTabs').addEventListener('click', e => { const button = e.target.closest('[data-provider]'); if (!button) return; selected = button.dataset.provider; limit = 50; render(); });
    document.querySelector('#mallSupplierSearch').addEventListener('input', () => { limit = 50; render(); });
    document.querySelector('#mallSupplierMore').addEventListener('click', () => { limit += 50; render(); });
    render();
    state('공급처별 조회');
  } catch (error) {
    summary.replaceChildren();
    host.innerHTML = '<h2>공급처별 전체 상품 현황</h2><p class="empty">' + escape(error.message || '조회 권한과 연결을 확인하세요.') + '</p><a class="button" href="' + adminBase + '/sourcing">공급망 설정</a>';
    state('권한·연결 확인 필요');
  }
}
