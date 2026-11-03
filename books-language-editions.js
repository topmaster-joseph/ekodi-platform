// BOOKS-LANGUAGE-EDITION-DISCOUNT-001 — 같은 책의 다른 언어판 50% 할인
//
// 규칙: 같은 workId(같은 저작물)를 가진 전자책 가운데 언어(language)가 다른 판을
// 이미 내 서재에 보유(취소·환불로 회수되지 않은 권한)한 구매자는, 새 언어판을 정가의 50%로 산다.
//   • 한국어판 → 영문판, 영문판 → 한국어판, 이후 중국어·베트남어 등 모든 추가 언어판에 동일 적용
//   • 같은 언어의 다른 형식(예: 같은 한국어판 재구매)은 대상이 아니다
//   • 회원등급 할인과 겹쳐 적용하지 않고, 둘 중 더 낮은 금액을 적용한다
//   • 가격은 언제나 서버가 계산한다(클라이언트 금액 불신)
// 할인율은 books/commerce.json policy.languageEditionDiscount.rate 로 조정할 수 있으며,
// 범위를 벗어나거나 값이 없으면 0.5를 쓴다.

export const DEFAULT_LANGUAGE_EDITION_RATE = 0.5;
export const LANGUAGE_EDITION_TIER = 'language-edition';

const norm = v => String(v ?? '').trim().toLowerCase();
export const workIdOf = book => String(book?.workId || '').trim();
export const languageOf = book => norm(Array.isArray(book?.language) ? book.language[0] : book?.language);

/** 같은 저작물의 다른 언어판(자기 자신·같은 언어 제외). workId나 언어가 없으면 빈 목록(fail closed). */
export function otherLanguageEditions(catalog, book) {
  const work = workIdOf(book);
  const lang = languageOf(book);
  if (!work || !lang) return [];
  return (catalog?.books || []).filter(b => b && b.id !== book.id && workIdOf(b) === work && languageOf(b) && languageOf(b) !== lang);
}

export function languageEditionRate(policy) {
  const r = Number(policy?.languageEditionDiscount?.rate);
  return Number.isFinite(r) && r > 0 && r < 1 ? r : DEFAULT_LANGUAGE_EDITION_RATE;
}

/** 구매자가 보유한 다른 언어판(활성 권한)을 찾는다. 없으면 null. */
export async function ownedOtherLanguageEdition(env, buyer, catalog, book) {
  if (!buyer?.userId || !env?.DB) return null;
  for (const sibling of otherLanguageEditions(catalog, book)) {
    const row = await env.DB.prepare('SELECT 1 FROM books_entitlements WHERE buyer_user_id=? AND book_id=? AND revoked_at IS NULL')
      .bind(buyer.userId, sibling.id).first();
    if (row) return sibling;
  }
  return null;
}

/** 회원등급 가격(price)과 언어판 할인 가격 중 낮은 쪽. owned가 없으면 원래 가격 그대로. */
export function applyLanguageEditionDiscount(price, policy, owned) {
  if (!price || !owned) return price;
  const rate = languageEditionRate(policy);
  const amount = Math.max(100, Math.round((price.listPrice * (1 - rate)) / 100) * 100);
  if (amount >= price.amount) return price;
  return {
    ...price,
    tierId: LANGUAGE_EDITION_TIER,
    tierLabel: `다른 언어판 보유 ${Math.round(rate * 100)}% 할인`,
    amount,
    discountRate: rate,
    languageEdition: { sourceBookId: owned.id, sourceLanguage: languageOf(owned), rate },
  };
}
