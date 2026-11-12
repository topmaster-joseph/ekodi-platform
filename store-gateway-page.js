// The former public multi-store gateway is a compatibility address for BBQ only.
// Keep /cmpmyi/admin/** and POS endpoints intact until their separately authorized migration.
export const BBQ_PUBLIC_PATH = '/bbqcg';
export function storeGatewayPage(request = new Request('https://ekodi.kr/cmpmyi')) {
  const previous = new URL(request.url);
  const target = new URL(BBQ_PUBLIC_PATH, 'https://ekodi.kr');
  target.search = previous.search;
  return new Response(null, {
    status: 308,
    headers: {
      location: target.toString(),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, follow',
      'x-ekodi-route': 'bbqcg-former-store-gateway',
    },
  });
}
