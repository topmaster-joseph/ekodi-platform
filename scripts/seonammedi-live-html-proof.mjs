/**
 * Strictly verify the emitted source against the known live HTML transformations.
 * Never silently normalize unknown content: every removed fragment belongs to a
 * specific, already-audited first-party or Cloudflare edge transformation.
 */
const origins=new Set(['https://ekodi.kr/seonammedi','https://seonammedi.kr']);
const adminExtension='<link rel="stylesheet" href="/site-publication-admin.css" data-ekodi-site-publication-admin-style><script src="/site-publication-admin.js" defer data-ekodi-site-publication-admin data-site-id="seonammedi"></script>';
const cfBeacon=/\n<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/[a-zA-Z0-9]+" integrity="sha512-[a-zA-Z0-9+/=]+" data-cf-beacon='([^']+)' crossorigin="anonymous"><\/script>(?=\n<\/body>)/g;

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
  let beacons=0;
  let html=String(rawHtml).replace(cfBeacon,(_markup,meta)=>{
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

  if(pageName==='admin/index.html'){
    const count=html.split(adminExtension).length-1;
    if(count!==1)throw new Error('seonammedi_admin_publication_extension_contract_mismatch');
    html=html.replace(adminExtension,'');
  }else if(html.includes('data-ekodi-site-publication-admin-style')){
    throw new Error('unexpected_site_publication_injection_outside_admin');
  }
  return Object.freeze({html,beacons,adminExtensionRemoved:pageName==='admin/index.html'});
}
