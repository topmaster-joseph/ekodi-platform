const ORIGINS = Object.freeze({
  'church.ekodi.kr': 'ekodi-church.pages.dev',
  'lab.ekodi.kr': 'ekodilab.pages.dev',
  'mall.ekodi.kr': 'ekodi-mall.pages.dev'
});

const GMAIL = 'https://mail.google.com/';

const REDIRECTS = Object.freeze({
  'biz.ekodi.kr': 'https://ekodibiz.kr',
  'live.church.ekodi.kr': 'https://www.youtube.com/@ekodichurch/live',
  'mail.ekodi.kr': GMAIL,
  'mail.biz.ekodi.kr': GMAIL,
  'mail.church.ekodi.kr': GMAIL,
  'mail.lab.ekodi.kr': GMAIL,
  'mail.books.ekodi.kr': GMAIL,
  'mail.trade.ekodi.kr': GMAIL
});

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    const redirectTarget = REDIRECTS[incoming.hostname];
    if (redirectTarget) {
      const target = new URL(redirectTarget);
      if (incoming.hostname === 'biz.ekodi.kr') {
        target.pathname = incoming.pathname;
        target.search = incoming.search;
      }
      return Response.redirect(target.toString(), 302);
    }

    const originHost = ORIGINS[incoming.hostname];
    if (!originHost) return new Response('Not found', { status: 404 });

    const upstreamUrl = new URL(incoming);
    upstreamUrl.protocol = 'https:';
    upstreamUrl.hostname = originHost;
    upstreamUrl.port = '';

    const upstreamRequest = new Request(upstreamUrl, request);
    const upstreamResponse = await fetch(upstreamRequest);
    const headers = new Headers(upstreamResponse.headers);

    const location = headers.get('location');
    if (location) {
      try {
        const redirect = new URL(location, upstreamUrl);
        if (redirect.hostname === originHost) {
          redirect.hostname = incoming.hostname;
          redirect.protocol = 'https:';
          headers.set('location', redirect.toString());
        }
      } catch {
        // Preserve non-URL Location headers unchanged.
      }
    }

    headers.set('x-ekodi-edge', 'service-proxy');
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers
    });
  }
};
