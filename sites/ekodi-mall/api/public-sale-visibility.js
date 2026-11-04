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
