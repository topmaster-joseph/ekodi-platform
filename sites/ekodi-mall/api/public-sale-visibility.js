// Public discovery only. Seller drafts and previously shared detail URLs remain preserved.
// A published row is not necessarily purchasable: checkout must be ready, in stock and
// backed by an approved business store; affiliate listings require a live HTTPS buy link.
export const PUBLIC_SALE_LISTING_WHERE = `(p.status='published' AND (
  (p.sale_type='affiliate' AND p.affiliate_url LIKE 'https://%')
  OR (p.sale_type='direct' AND p.checkout_ready=1 AND p.price>0 AND p.stock_quantity>0
      AND (p.seller_type!='business' OR EXISTS (
        SELECT 1 FROM stores approved_store
        WHERE approved_store.id=p.store_id AND approved_store.verification_status='verified'
      )))
))`;

// Legacy curated and bookstore mirrors: only demonstrably purchasable titles surface.
// Pending books remain in the seller's provider mirror and retain their old detail URLs.
export function isPublicStaticSale(product) {
  if (product?.published !== true || product.status !== '판매 중' || product.action?.type !== 'external') return false;
  try { const url = new URL(product.action.url); return url.protocol === 'https:' && Boolean(url.hostname); }
  catch { return false; }
}

/**
 * A publisher-approved public BOOK page is informational even before checkout
 * is available. Public discovery cards still require independently verified
 * live checkout: search-indexability is NOT payment authorization.
 * The bookstore mirror is allowlisted by existingEditionAllowed(), and cannot
 * be forged through a seller-supplied product record.
 */
export function isPublicBookInformation(product) {
  return product?.published === true &&
    product.category === 'book' &&
    product.source?.system === 'ekodi-bookstore' &&
    /^BOOK-[A-Z0-9-]{3,40}$/.test(String(product.source.bookId || '')) &&
    /^https:\/\/ekodi\.kr\/books\//.test(String(product.source.detailUrl || ''));
}

/** Index public information pages regardless of temporary checkout readiness. */
export function isPublicIndexableProduct(product) {
  return isPublicStaticSale(product) || isPublicBookInformation(product);
}
