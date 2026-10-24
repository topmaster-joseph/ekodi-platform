// EKODI-MALL-DOMEGGOOK-CURATION-001
// 도매꾹 전체를 소싱하지 않고, 수요 신호가 있는 키워드만 골라 도매매(위탁) 랭킹 상위 상품 중
// 판매가능성 점수가 높은 상품을 목표 개수(운영 설정 1000)까지 자동 등록·게시·관리한다.
//
// 키워드 근거(2026-10 기준):
//  - 국가데이터처 온라인쇼핑동향 2026년 7월: 자동차·자동차용품 +31.1%, 농축수산물·화장품 성장(규제 품목이라 제외),
//    의복 -6.1%·스포츠레저 -6.0%(비중 축소). 출처: 파이낸셜뉴스 2026-09-01 보도.
//  - 계절성(11~12월): 방한·단열·보온, 연말 선물·다이어리, 실내 수납·주방.
//  - 도매매 랭킹(so=rd): 실제 위탁 셀러 판매가 많은 순서로 정렬 → 상품 단위 수요 신호.
// 제외: 식품·건강·화장품·유아동·전기전자(KC)·의약외품·화학제품 등 인증/신고가 필요한 품목.
import { importDomeggookProduct, PROVIDER } from './domeggook-import.js';
import { raiseAlert } from './ops-alerts.js';

const ENDPOINT = 'https://domeggook.com/ssl/api/';
export const CURATION_KEYWORDS = [
  // [keyword, weight] — weight 는 시장 성장률·계절성 가중치. 목표 1000개: 키워드 70여 개 × 키워드당 최대 15개.
  // 자동차용품(+31.1%)
  ['차량용 수납', 1.3], ['차량 정리함', 1.3], ['트렁크 정리함', 1.25], ['차량용 쿠션', 1.2], ['차량 햇빛가리개', 1.1], ['차량 컵홀더', 1.2],
  ['차량 시트커버', 1.15], ['차량 핸드폰 거치대', 1.2], ['차량 매트', 1.15], ['세차 타월', 1.2], ['차량 성에제거', 1.25], ['핸들커버', 1.15],
  // 겨울 계절(11~12월)
  ['극세사 담요', 1.25], ['무릎담요', 1.2], ['수면양말', 1.2], ['문풍지', 1.25], ['단열 뽁뽁이', 1.2], ['방한 장갑', 1.15], ['넥워머', 1.1],
  ['귀마개', 1.1], ['방한 모자', 1.1], ['수면바지', 1.1], ['털슬리퍼', 1.15], ['방풍비닐', 1.2], ['극세사 이불', 1.1], ['보온 도시락', 1.15],
  // 연말·선물
  ['다이어리', 1.15], ['크리스마스 장식', 1.2], ['크리스마스 트리', 1.15], ['선물 포장', 1.1], ['포장 박스', 1.05], ['캘린더', 1.1], ['머그컵', 1.05],
  // 수납·정리
  ['수납박스', 1.1], ['압축팩', 1.1], ['옷걸이', 1.0], ['서랍 정리함', 1.05], ['리빙박스', 1.05], ['신발 정리대', 1.05], ['선반 정리대', 1.0], ['이불 수납', 1.1],
  // 욕실·청소
  ['욕실 선반', 1.0], ['욕실 매트', 1.05], ['청소 브러쉬', 1.0], ['밀대 걸레', 1.05], ['극세사 행주', 1.05], ['수세미', 1.0], ['빨래 바구니', 1.0], ['빨래 건조대', 1.05],
  // 주방
  ['밀폐용기', 1.05], ['실리콘 주방', 1.0], ['주방 정리', 1.05], ['텀블러', 1.1], ['보온병', 1.15], ['도마', 1.0], ['수저 세트', 1.0], ['냄비 받침', 1.0], ['앞치마', 1.0],
  // 반려동물
  ['반려동물 장난감', 1.1], ['고양이 스크래쳐', 1.1], ['강아지 방석', 1.15], ['강아지 옷', 1.15], ['반려동물 식기', 1.05], ['고양이 숨숨집', 1.1], ['배변봉투', 1.05],
  // 생활·잡화·문구
  ['실내화', 1.1], ['우산', 1.0], ['에코백', 1.0], ['파우치', 1.0], ['여행용 파우치', 1.05], ['필통', 1.0], ['메모지', 0.95], ['쿠션 커버', 1.05], ['러그', 1.05], ['암막 커튼', 1.1]
];
const EXCLUDE = /(식품|간식|음료|커피|차\s?티백|건강|영양|비타민|화장품|크림|로션|세럼|샴푸|유아|아기|아동|어린이|키즈|베이비|충전|전기|배터리|USB|LED|전자|블루투스|무선|의료|마스크|핫팩|방향제|탈취제|세제|살균|소독|라이터|성인|식칼|과도|담배|전자담배|의약|렌즈|중고|리퍼)/i;
const MIN_PRICE = 1500, MAX_PRICE = 40000;
const DEFAULT_PER_KEYWORD = 15;
const RESCAN_MS = 7 * 24 * 60 * 60 * 1000;
const isoNow = () => new Date().toISOString();

export function titleKey(title) {
  return String(title || '').toLowerCase().replace(/[a-z]{1,4}-?\d{3,}/g, '').replace(/\[[^\]]*\]|\([^)]*\)/g, '')
    .replace(/[^0-9a-z가-힣]/g, '').split('').sort().join('').slice(0, 120);
}

export function scoreListItem(item, rankPos, total, weight = 1) {
  const price = Number(String(item.price ?? '').replace(/,/g, '').split('|')[0].replace(/^\d+\+/, '')) || 0;
  const title = String(item.title || '');
  if (!item.no || !title) return { reject: 'no-data' };
  if (EXCLUDE.test(title)) return { reject: 'regulated-category', price };
  if (price < MIN_PRICE || price > MAX_PRICE) return { reject: 'price-band', price };
  if (Number(item.unitQty) > 1) return { reject: 'moq', price };
  const rankScore = 1 - (rankPos / (total + 1));               // 도매매 랭킹 상위일수록 높음
  const priceScore = price >= 3000 && price <= 25000 ? 0.3 : 0.1; // 충동구매 가격대 가산
  return { score: Math.round((rankScore * weight + priceScore) * 1000) / 1000, price };
}

function listItems(payload) {
  const root = payload?.domeggook || payload || {};
  const raw = root.list?.item ?? root.list ?? [];
  return Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
}

export async function resolveCurationSeller(env) {
  const email = String(env.MALL_CURATION_SELLER_EMAIL || 'joseph@ekodi.kr').trim().toLowerCase();
  const row = await env.DB.prepare("SELECT user_id,email FROM seller_profiles WHERE lower(email)=? AND direct_sale_status='verified'").bind(email).first();
  return row ? { id: row.user_id, email: row.email, email_confirmed_at: 'seller-profile-verified' } : null;
}

async function nextKeyword(env) {
  for (const [keyword] of CURATION_KEYWORDS) {
    await env.DB.prepare('INSERT INTO supply_curation_keywords (keyword) VALUES (?) ON CONFLICT(keyword) DO NOTHING').bind(keyword).run();
  }
  const cutoff = new Date(Date.now() - RESCAN_MS).toISOString();
  const row = await env.DB.prepare('SELECT keyword FROM supply_curation_keywords WHERE scanned_at IS NULL OR scanned_at<? ORDER BY scanned_at IS NOT NULL, scanned_at LIMIT 1').bind(cutoff).first();
  return row?.keyword || '';
}

export async function discover(env, fetchImpl = fetch) {
  const keyword = await nextKeyword(env);
  if (!keyword) return { scanned: '', added: 0 };
  const weight = (CURATION_KEYWORDS.find(([k]) => k === keyword) || [])[1] || 1;
  const params = new URLSearchParams({ ver: '4.1', mode: 'getItemList', aid: env.DOMEMAE_API_KEY, market: 'supply', om: 'json', kw: keyword, sz: '100', pg: '1', so: 'rd' });
  const res = await fetchImpl(`${ENDPOINT}?${params}`, { headers: { accept: 'application/json' } });
  let payload = null; try { payload = await res.json(); } catch {}
  const items = listItems(payload);
  const now = isoNow();
  let added = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const s = scoreListItem(it, i, items.length, weight);
    await env.DB.prepare(`INSERT INTO supply_candidates (item_no,keyword,title,price,rank_pos,score,status,reason,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(item_no) DO NOTHING`)
      .bind(String(it.no || `x${i}`).slice(0, 30), keyword, String(it.title || '').slice(0, 200), s.price || null, i + 1, s.score || 0,
        s.reject ? 'rejected' : 'new', s.reject || '', now, now).run();
    if (!s.reject) added += 1;
  }
  await env.DB.prepare('UPDATE supply_curation_keywords SET scanned_at=?,found=? WHERE keyword=?').bind(now, added, keyword).run();
  return { scanned: keyword, added, listed: items.length, httpStatus: res.status };
}

export async function activeCuratedCount(env, sellerId) {
  const row = await env.DB.prepare("SELECT COUNT(*) n FROM products WHERE seller_id=? AND supply_provider=? AND status='published' AND COALESCE(stock_quantity,0)>0").bind(sellerId, PROVIDER).first();
  return Number(row?.n || 0);
}

/**
 * 한 번의 cron 실행에서 하는 일(외부 호출 최소화):
 *  - 대기 후보가 적으면 키워드 1개 탐색
 *  - 목표 미달이면 최고 점수 후보 최대 `perRun`개 가져와 게시
 */
export async function runCuration(env, deps, { fetchImpl = fetch, perRun = 3 } = {}) {
  if (!env?.DB || !env.DOMEMAE_API_KEY) return { skipped: 'no-key' };
  if (String(env.DOMEGGOOK_CURATION_ENABLED || '').toLowerCase() !== 'true') return { skipped: 'disabled' };
  const target = Math.max(0, Math.min(2000, Number(env.DOMEGGOOK_CURATION_TARGET) || 100));
  const perKeyword = Math.max(1, Math.min(50, Number(env.DOMEGGOOK_CURATION_PER_KEYWORD) || DEFAULT_PER_KEYWORD));
  const seller = await resolveCurationSeller(env);
  if (!seller) return { skipped: 'no-seller' };
  const active = await activeCuratedCount(env, seller.id);
  if (active >= target) return { active, target, done: true };
  const summary = { active, target, imported: 0, rejected: 0 };
  // 키워드 상한에 걸리지 않은 대기 후보만 센다(상한에 막힌 후보가 쌓여 탐색이 멈추지 않도록).
  const queued = await env.DB.prepare(`SELECT COUNT(*) n FROM supply_candidates c WHERE c.status='new'
    AND (SELECT COUNT(*) FROM supply_candidates x WHERE x.keyword=c.keyword AND x.status='imported') < ?`).bind(perKeyword).first();
  if (Number(queued?.n || 0) < 5) summary.discovery = await discover(env, fetchImpl);
  const picks = await env.DB.prepare(`SELECT c.item_no,c.keyword,c.title FROM supply_candidates c
    WHERE c.status='new' AND (SELECT COUNT(*) FROM supply_candidates x WHERE x.keyword=c.keyword AND x.status='imported') < ?
    ORDER BY c.score DESC LIMIT ?`).bind(perKeyword, Math.min(perRun, target - active)).all();
  const legacy = await env.DB.prepare("SELECT item_no,title FROM supply_candidates WHERE status='imported' AND title_key='' LIMIT 50").all();
  for (const row of legacy.results || []) await env.DB.prepare('UPDATE supply_candidates SET title_key=? WHERE item_no=?').bind(titleKey(row.title), row.item_no).run();
  for (const pick of picks.results || []) {
    const now = isoNow();
    // 모델코드만 다른 같은 상품(예: DD-10817 / RD-10817)은 하나만 올린다.
    const key = titleKey(pick.title);
    if (key && await env.DB.prepare("SELECT 1 FROM supply_candidates WHERE status='imported' AND title_key=?").bind(key).first()) {
      await env.DB.prepare("UPDATE supply_candidates SET status='rejected',reason='duplicate-title',updated_at=? WHERE item_no=?").bind(now, pick.item_no).run();
      summary.rejected += 1;
      continue;
    }
    const result = await importDomeggookProduct(env, seller, { itemNo: pick.item_no }, { ...deps, fetchImpl, requireLicense: true, maxImages: 4 });
    if (result.status >= 300) {
      await env.DB.prepare("UPDATE supply_candidates SET status='rejected',reason=?,updated_at=? WHERE item_no=?").bind(String(result.body?.error || result.status).slice(0, 200), now, pick.item_no).run();
      summary.rejected += 1;
      continue;
    }
    const productId = result.body.product?.id;
    const published = await deps.setPublished(env, seller.id, productId, true, true);
    if (published.errors) {
      await env.DB.prepare("UPDATE supply_candidates SET status='rejected',reason=?,product_id=?,updated_at=? WHERE item_no=?").bind(published.errors.join(' ').slice(0, 200), productId, now, pick.item_no).run();
      summary.rejected += 1;
      continue;
    }
    await env.DB.prepare("UPDATE supply_candidates SET status='imported',product_id=?,title_key=?,updated_at=? WHERE item_no=?").bind(productId, key, now, pick.item_no).run();
    summary.imported += 1;
  }
  if (!summary.imported && !(picks.results || []).length && summary.discovery && !summary.discovery.scanned) {
    await raiseAlert(env, { severity: 'info', kind: 'supply.curation_exhausted', message: `자동 선별 후보 소진: 게시 ${active}/${target}개. 키워드 추가가 필요합니다.` });
  }
  return summary;
}
