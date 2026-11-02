// EKODI-MALL-NATURAL-CATEGORY-001
// Supplier items enter existing customer-facing Mall categories, not a supplier aisle.
// Regulated food/health and books are excluded upstream by curated sourcing.
// A business may edit the category later; imports only classify newly created rows.
const GIFT = /(?:크리스마스|트리|장식|선물|기념품|리본|포장|다이어리|달력|캘린더|카드봉투|축하|파티|기프트|감사|꽃다발)/i;
export function curatedMallCategory(title = '', keyword = '') {
  const name = String(title || '').trim();
  const source = String(keyword || '').trim();
  return GIFT.test(name) || GIFT.test(source) ? 'gift' : 'living';
}
