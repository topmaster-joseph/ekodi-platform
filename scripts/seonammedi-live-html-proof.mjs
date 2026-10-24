/**
 * Strictly verify the emitted source against the known live HTML transformations.
 * Never silently normalize unknown content: every removed fragment belongs to a
 * specific, already-audited first-party or Cloudflare edge transformation.
 */
import { verificationMetaTags } from '../search-engine-verification.js';

const origins=new Set(['https://ekodi.kr/seonammedi','https://seonammedi.kr']);
const adminExtension='<link rel="stylesheet" href="/site-publication-admin.css" data-ekodi-site-publication-admin-style><script src="/site-publication-admin.js" defer data-ekodi-site-publication-admin data-site-id="seonammedi"></script>';
const cfBeacon=/\n<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/[a-zA-Z0-9]+" integrity="sha512-[a-zA-Z0-9+/=]+" data-cf-beacon='([^']+)' crossorigin="anonymous"><\/script>(?=\n<\/body>)/g;

// Cloudflare Bot Management / Bot Fight Mode "JavaScript detections" injects one
// inline script before </body> that loads a same-origin /cdn-cgi challenge script.
// Recognize only that exact shape: hex ray id, base64 token, same-origin jsd path,
// no external URL, no nested markup. Anything else stays a mismatch.
const cfJsd=/<script>window\.__CF\$cv\$params=\{r:'([0-9a-f]{16})',t:'([A-Za-z0-9+\/=]+)'((?:,[a-z]{1,8}:(?:'[A-Za-z0-9+\/=_.\-]*'|\d{1,6}))*)\};([^<]*)<\/script>(?=(?:\n?<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/|<\/body>))/g;
// Cloudflare serves either the classic jsd loader or the newer precursor loader.
// The loader body is fixed edge code; only __CF$cv$params varies per request.
// Accept exactly these audited bodies (optionally with Cloudflare's CSP nonce).
// A body that merely *mentions* a jsd path is not trusted: arbitrary same-origin
// or protocol-relative script would otherwise be stripped as "Cloudflare".
// New Cloudflare templates fail closed with a diagnostic fragment for audit.
const CF_NONCE="(?:[a-z]\\.nonce='[A-Za-z0-9+\\/=]{0,128}';)?";
const CF_LOADER_BODIES=[
  new RegExp("^var a=document\\.createElement\\('script'\\);"+CF_NONCE.replace('[a-z]','a')+"a\\.src='\\/cdn-cgi\\/challenge-platform\\/scripts\\/jsd\\/main\\.js';document\\.getElementsByTagName\\('head'\\)\\[0\\]\\.appendChild\\(a\\);$"),
  new RegExp("^\\(function\\(\\)\\{if\\(!document\\.body\\)return;var s=document\\.createElement\\('script'\\);"+CF_NONCE.replace('[a-z]','s')+"s\\.src='\\/cdn-cgi\\/challenge-platform\\/scripts\\/precursor\\/main\\.js';document\\.head\\.appendChild\\(s\\);\\}\\)\\(\\);$"),
];

function stripCloudflareJsDetections(html){
  let count=0;
  const out=String(html).replace(cfJsd,(_m,_ray,_token,_extra,body)=>{
    count++;
    if(!CF_LOADER_BODIES.some(re=>re.test(body))){
      throw new Error('untrusted_cloudflare_js_detection_injection');
    }
    // Cloudflare inserts the tag verbatim immediately before </body>; remove only the tag.
    return '';
  });
  if(count>1)throw new Error('multiple_cloudflare_js_detection_injections');
  if(out.includes('__CF$cv$params')||out.includes('/cdn-cgi/challenge-platform/')){
    // Diagnostic fragment (public Cloudflare markup only) so the shape can be audited.
    const at=Math.max(0,Math.min(...['<script>window.__CF$cv$params','__CF$cv$params','/cdn-cgi/challenge-platform/'].map(m=>out.indexOf(m)).filter(i=>i>=0))-80);
    throw new Error('unrecognized_cloudflare_js_detection_injection fragment='+JSON.stringify(out.slice(at,at+900)));
  }
  return {html:out,count};
}

function assertOrigin(origin){
  if(!origins.has(origin))throw new Error('unexpected_seonammedi_html_verification_origin');
}

export function expectedSeonamMediHtmlAtOrigin(sourceHtml,origin){
  assertOrigin(origin);
  if(origin!=='https://seonammedi.kr')return String(sourceHtml);
  // Only HTML src/href attributes are rewritten by the independent domain gateway.
  // Preserve OG URLs, text, scripts and every other byte.
  return String(sourceHtml).replace(/((?:href|src)=["'])\/seonammedi\//g,'$1/');
}

export function normalizeSeonamMediLiveHtml(rawHtml,{origin,page}){
  assertOrigin(origin);
  const pageName=String(page||'');
  if(!['index.html','admin/index.html','finance/index.html','notices/index.html'].includes(pageName)){
    throw new Error('unexpected_seonammedi_html_verification_page');
  }
  const jsd=stripCloudflareJsDetections(rawHtml);
  let beacons=0;
  let html=jsd.html.replace(cfBeacon,(_markup,meta)=>{
    beacons++;
    let decoded={};
    try{decoded=JSON.parse(meta)}catch{throw new Error('untrusted_cloudflare_beacon_metadata')}
    if(!/^[a-f0-9]{32}$/.test(String(decoded.token||''))||
       !/^\d{4}\.\d{2}\.\d{1,2}$/.test(String(decoded.version||''))){
      throw new Error('untrusted_cloudflare_beacon_metadata');
    }
    return '';
  });
  if(beacons>1)throw new Error('multiple_cloudflare_beacon_injections');
  if(html.includes('static.cloudflareinsights.com'))throw new Error('unrecognized_cloudflare_beacon_injection');

  // SEARCH-REGISTER-001: the customer-domain gateway inserts the exact registered
  // search-engine ownership tags right after <head>. Remove only that exact
  // string at that exact position on the customer origin; anything else fails.
  if(origin==='https://seonammedi.kr'){
    const tags=verificationMetaTags('seonammedi.kr');
    if(tags){
      const head=html.match(/<head\b[^>]*>/i);
      if(!head)throw new Error('seonammedi_live_html_head_missing');
      const at=head.index+head[0].length;
      if(html.slice(at,at+tags.length)===tags)html=html.slice(0,at)+html.slice(at+tags.length);
    }
    if(/(?:google|naver)-site-verification/.test(html))throw new Error('unexpected_search_verification_injection');
  }

  if(pageName==='admin/index.html'){
    const count=html.split(adminExtension).length-1;
    if(count!==1)throw new Error('seonammedi_admin_publication_extension_contract_mismatch');
    html=html.replace(adminExtension,'');
  }else if(html.includes('data-ekodi-site-publication-admin-style')){
    throw new Error('unexpected_site_publication_injection_outside_admin');
  }
  return Object.freeze({html,beacons,jsDetections:jsd.count,adminExtensionRemoved:pageName==='admin/index.html'});
}
