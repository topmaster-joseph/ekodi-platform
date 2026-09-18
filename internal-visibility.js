export const INTERNAL_ROBOTS = 'noindex, nofollow, noarchive, nosnippet';

export function applyInternalVisibilityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set('X-Robots-Tag', INTERNAL_ROBOTS);
  secured.headers.set('Cache-Control', 'no-store');
  secured.headers.set('Referrer-Policy', 'no-referrer');
  return secured;
}

export function internalRobotsTxt() {
  return new Response('User-agent: *\nDisallow: /\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': INTERNAL_ROBOTS
    }
  });
}

export function internalRobotsMeta() {
  return `<meta name="robots" content="${INTERNAL_ROBOTS.replaceAll(' ', '')}">`;
}
