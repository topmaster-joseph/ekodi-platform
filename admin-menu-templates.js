// ADMIN-AUDIENCE-001 · 사이트 원장 › 관리자 메뉴 템플릿 (read-only view).
// The classification ledger config/admin-menu-audience-policy.json is the source
// of truth; this browser copy is held equal to it by
// test/admin-menu-templates-view.test.mjs. Changes go through an EKODI-orchestrated
// PR to the ledger; widening tenant exposure needs the owner's approval.
export const SITE_ADMIN_MENU_TEMPLATE = Object.freeze({
  "siteTypes": {
    "church": {
      "ko": "교회·공동체"
    },
    "store": {
      "ko": "매장·상거래"
    },
    "org": {
      "ko": "단체·기관"
    },
    "brand": {
      "ko": "개인·브랜드"
    }
  },
  "groups": [
    {
      "id": "home",
      "ko": "홈",
      "menus": [
        {
          "id": "overview",
          "ko": "운영 현황"
        },
        {
          "id": "command",
          "ko": "에코디와 대화"
        }
      ]
    },
    {
      "id": "settings",
      "ko": "사이트 설정",
      "menus": [
        {
          "id": "profile",
          "ko": "기본정보"
        },
        {
          "id": "chrome",
          "ko": "헤더·푸터·테마"
        },
        {
          "id": "domain",
          "ko": "도메인"
        },
        {
          "id": "language",
          "ko": "언어"
        }
      ]
    },
    {
      "id": "members",
      "ko": "회원·운영진",
      "menus": [
        {
          "id": "members",
          "ko": "회원"
        },
        {
          "id": "staff",
          "ko": "운영진"
        },
        {
          "id": "approvals",
          "ko": "가입 승인"
        }
      ]
    },
    {
      "id": "content",
      "ko": "콘텐츠·소통",
      "menus": [
        {
          "id": "posts",
          "ko": "게시물·미디어"
        },
        {
          "id": "devotional",
          "ko": "묵상·다국어",
          "siteTypes": [
            "church"
          ]
        },
        {
          "id": "channels",
          "ko": "방송·자동게시"
        },
        {
          "id": "events",
          "ko": "행사·예약"
        },
        {
          "id": "messages",
          "ko": "일정·알림"
        }
      ]
    },
    {
      "id": "store",
      "ko": "매장·주문",
      "menus": [
        {
          "id": "orders",
          "ko": "주문",
          "siteTypes": [
            "store"
          ]
        },
        {
          "id": "catalog",
          "ko": "메뉴·상품",
          "siteTypes": [
            "store"
          ]
        },
        {
          "id": "pos",
          "ko": "POS 연결",
          "siteTypes": [
            "store"
          ]
        }
      ]
    },
    {
      "id": "marketing",
      "ko": "마케팅",
      "menus": [
        {
          "id": "channels",
          "ko": "채널",
          "siteTypes": [
            "store",
            "org",
            "brand"
          ]
        },
        {
          "id": "publishing",
          "ko": "게시",
          "siteTypes": [
            "store",
            "org",
            "brand"
          ]
        },
        {
          "id": "results",
          "ko": "성과",
          "siteTypes": [
            "store",
            "org",
            "brand"
          ]
        }
      ]
    },
    {
      "id": "billing",
      "ko": "결제·정산 보고",
      "readOnly": true,
      "note": "EKODIBIZ is the merchant of record; site admins read payments and settlement reports only.",
      "menus": [
        {
          "id": "payments",
          "ko": "결제 내역"
        },
        {
          "id": "reports",
          "ko": "정산 보고서"
        }
      ]
    },
    {
      "id": "ai",
      "ko": "AI 도우미",
      "menus": [
        {
          "id": "usage",
          "ko": "사용량"
        },
        {
          "id": "delegation",
          "ko": "위임 권한"
        }
      ]
    },
    {
      "id": "records",
      "ko": "기록",
      "menus": [
        {
          "id": "changes",
          "ko": "변경 기록"
        },
        {
          "id": "audit",
          "ko": "감사"
        }
      ]
    }
  ]
});

const SECTION = 'menu-templates';
const MODULE_ID = 'ekodiAdminMenuTemplates';
const TOKEN_KEY = 'ekodi-auth-token';
const SESSION_URL = 'https://ekodi.kr/api/session';

export function menuTemplateRows(template = SITE_ADMIN_MENU_TEMPLATE) {
  const types = Object.keys(template.siteTypes || {});
  return (template.groups || []).map(group => ({
    id: group.id,
    ko: group.ko,
    readOnly: Boolean(group.readOnly),
    menus: (group.menus || []).map(menu => ({
      id: menu.id,
      ko: menu.ko,
      enabled: Object.fromEntries(types.map(type => [type, !menu.siteTypes || menu.siteTypes.includes(type)])),
    })),
  }));
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

export function renderMenuTemplateTable(template = SITE_ADMIN_MENU_TEMPLATE) {
  const types = Object.entries(template.siteTypes || {});
  const head = types.map(([, type]) => `<th scope="col">${escapeHtml(type.ko)}</th>`).join('');
  const body = menuTemplateRows(template).map(group => {
    const cells = types.map(([type]) => {
      const on = group.menus.filter(menu => menu.enabled[type]);
      const state = on.length === group.menus.length ? 'all' : (on.length ? 'some' : 'none');
      const label = state === 'all' ? '전체 켜짐' : (state === 'none' ? '꺼짐' : `${on.length}/${group.menus.length} 켜짐`);
      const detail = state === 'some' ? `<small>${on.map(menu => escapeHtml(menu.ko)).join(' · ')}</small>` : '';
      return `<td><span class="ekodi-mt-state" data-state="${state}">${label}</span>${detail}</td>`;
    }).join('');
    const menus = group.menus.map(menu => escapeHtml(menu.ko)).join(' · ');
    const readOnly = group.readOnly ? '<em>열람 전용</em>' : '';
    return `<tr><th scope="row"><strong>${escapeHtml(group.ko)}</strong>${readOnly}<small>${menus}</small></th>${cells}</tr>`;
  }).join('');
  return `<table class="ekodi-mt-table"><colgroup><col class="ekodi-mt-menu">${types.map(() => '<col>').join('')}</colgroup><thead><tr><th scope="col">사이트 관리자 메뉴</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

if (typeof document !== 'undefined' && !document.getElementById(MODULE_ID)) {
  const content = document.querySelector('.content');
  const nav = document.querySelector('.sidebar nav');
  const root = document.documentElement;
  root.dataset.ekodiMenuTemplatesAuthorized = 'pending';

  const style = document.createElement('style');
  style.id = 'ekodi-admin-menu-templates-style';
  style.textContent = `
html:not([data-ekodi-menu-templates-authorized="true"]) .sidebar [data-section="menu-templates"]{display:none!important}
.ekodi-mt{display:grid;gap:14px}.ekodi-mt-head h2{margin:3px 0 5px;font-size:24px}.ekodi-mt-head p{margin:0;color:#52657a}
.ekodi-mt-wrap{overflow-x:auto;border:1px solid #d9e2ec;border-radius:12px;background:#fff}
.ekodi-mt-table{width:100%;min-width:760px;border-collapse:collapse;font-size:14px;table-layout:fixed}
.ekodi-mt-table col.ekodi-mt-menu{width:34%}
.ekodi-mt-table th,.ekodi-mt-table td{padding:10px 12px;border-top:1px solid #eef2f6;text-align:left;vertical-align:top}
.ekodi-mt-table thead th{border-top:0;background:#f6f8fb;font-size:13px;color:#33475b;white-space:nowrap;word-break:keep-all}
.ekodi-mt-table small{word-break:keep-all}
.ekodi-mt-table th[scope=row] strong{display:block}.ekodi-mt-table small{display:block;margin-top:3px;color:#66768a;font-size:12px;line-height:1.45}
.ekodi-mt-table em{display:inline-block;margin-left:6px;font-style:normal;font-size:11px;color:#8a4b00;background:#fdf1df;border-radius:99px;padding:1px 7px}
.ekodi-mt-state{display:inline-block;font-size:12px;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap}
.ekodi-mt-state[data-state=all]{background:#e6f4ec;color:#14663a}.ekodi-mt-state[data-state=some]{background:#fdf1df;color:#8a4b00}.ekodi-mt-state[data-state=none]{background:#eceff3;color:#3b4656}
.ekodi-mt-rules{display:grid;gap:6px;margin:0;padding:12px 14px 12px 30px;border:1px solid #d9e2ec;border-radius:12px;background:#f8fafc;font-size:13px;color:#33475b;line-height:1.55}
`;
  document.head.append(style);

  const panel = document.createElement('section');
  panel.id = MODULE_ID;
  panel.className = 'section ekodi-mt hidden-panel';
  panel.dataset.panel = SECTION;
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ekodi-mt-head">
      <p class="kicker">ADMIN-AUDIENCE-001</p>
      <h2>관리자 메뉴 템플릿</h2>
      <p>사이트 유형별로 각 사이트 관리자(/{사이트}/admin)에게 열리는 메뉴입니다.</p>
    </div>
    <div class="ekodi-mt-wrap">${renderMenuTemplateTable()}</div>
    <ol class="ekodi-mt-rules">
      <li>메뉴 분류는 에코디(EKODI AI Orchestrator)가 결정하고 분류 원장에 기록합니다. 개발 작업자는 스스로 분류하지 않습니다.</li>
      <li>사이트 관리자에게 메뉴를 새로 노출하는 변경은 권한 확대이므로 최고관리자 승인이 필요합니다. 노출을 줄이는 변경은 에코디가 자율 처리합니다.</li>
      <li>최고관리자는 사이트 데이터를 플랫폼 권한으로 직접 고치지 않고, 사이트 목록에서 해당 사이트 관리자 화면으로 들어가 처리합니다.</li>
    </ol>
  `;
  content?.append(panel);

  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  let authorized = false;
  let inFlight = null;

  function ensureNav() {
    if (!authorized || !nav) return;
    let button = nav.querySelector(`[data-section="${SECTION}"]`);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'nav'; button.dataset.section = SECTION;
      button.append(document.createTextNode('☰ ')); const label = document.createElement('span'); label.textContent = '관리자 메뉴 템플릿'; button.append(label); nav.append(button);
    }
    button.hidden = false; button.removeAttribute('aria-hidden'); button.disabled = false;
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail:{ section:SECTION } }));
  }
  function deny() {
    authorized = false; root.dataset.ekodiMenuTemplatesAuthorized = 'false';
    nav?.querySelector(`[data-section="${SECTION}"]`)?.remove();
    panel.hidden = true; panel.classList.add('hidden-panel');
  }
  function authorize() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const headers = new Headers();
        if (token()) headers.set('authorization', `Bearer ${token()}`);
        const response = await fetch(SESSION_URL, { headers, cache:'no-store' });
        if (!response.ok) throw new Error(`session ${response.status}`);
        const session = await response.json();
        if (session?.role !== 'super_admin') return deny();
        authorized = true; root.dataset.ekodiMenuTemplatesAuthorized = 'true'; ensureNav();
      } catch (error) {
        console.warn('[EKODI Menu Templates] authorization check failed', error);
        deny();
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  window.addEventListener('ekodi-admin-section-changed', event => {
    if (event.detail?.section === SECTION && !authorized) void authorize();
  });
  window.addEventListener('ekodi-admin-context-changed', event => {
    if (!authorized) return;
    if (event.detail?.context?.type !== 'platform') nav?.querySelector(`[data-section="${SECTION}"]`)?.remove();
    else ensureNav();
  });
  if (nav) new MutationObserver(() => {
    const button = nav.querySelector(`[data-section="${SECTION}"]`);
    if (button && !authorized) { button.hidden = true; button.setAttribute('aria-hidden','true'); button.disabled = true; }
  }).observe(nav, { childList:true, subtree:true });
  void authorize();
}
