// RFC 8291 / RFC 8188 Web Push, RFC 8292 VAPID. No third-party sender and no Node polyfills.
const utf8 = value => new TextEncoder().encode(value);
export function b64(bytes) {
  let s = '';
  for (const v of bytes) s += String.fromCharCode(v);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}
export function unb64(s) {
  const cleaned = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error('invalid_base64');
  const binary = atob(cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, '='));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function concat(...pieces) {
  const n = pieces.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(n); let i = 0;
  for (const p of pieces) { out.set(p, i); i += p.length; }
  return out;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', secret, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}
async function expand(prk, info, length) {
  let result = new Uint8Array(), prev = new Uint8Array(), counter = 1;
  while (result.length < length) {
    prev = await hmac(prk, concat(prev, info, Uint8Array.of(counter++)));
    result = concat(result, prev);
  }
  return result.slice(0, length);
}
export async function encryptWebPush(payload, clientPublicB64, authB64) {
  const receiver = unb64(clientPublicB64), auth = unb64(authB64);
  if (receiver.length !== 65 || receiver[0] !== 4 || auth.length !== 16) throw new Error('invalid_push_keys');
  const ephemeral = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
  const receiverKey = await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey},ephemeral.privateKey,256));
  const ikm = await expand(await hmac(auth,shared),concat(utf8('WebPush: info\0'),receiver,publicKey),32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt,ikm);
  const cek = await expand(prk,utf8('Content-Encoding: aes128gcm\0'),16);
  const nonce = await expand(prk,utf8('Content-Encoding: nonce\0'),12);
  const key = await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
  const plaintext = concat(utf8(JSON.stringify(payload)),Uint8Array.of(2));
  if (plaintext.length > 4000) throw new Error('push_payload_too_large');
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,plaintext));
  return concat(salt,Uint8Array.of(0,0,16,0,65),publicKey,ciphertext);
}
export function approvedPushEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host === 'push.services.mozilla.com'
      || host === 'web.push.apple.com'
      || host.endsWith('.push.apple.com')
      || host.endsWith('.notify.windows.com');
  } catch { return false; }
}
export async function sendWebPush(row, payload, env, transport = fetch) {
  if (!approvedPushEndpoint(row.endpoint)) throw new Error('unapproved_push_endpoint');
  const publicKey = String(env.NOTIFICATION_VAPID_PUBLIC_KEY || '');
  const privateJwk = JSON.parse(String(env.NOTIFICATION_VAPID_PRIVATE_JWK || '{}'));
  if (!publicKey || privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256') throw new Error('vapid_not_configured');
  const origin = new URL(row.endpoint).origin;
  const jwtHeader = b64(utf8(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const jwtPayload = b64(utf8(JSON.stringify({aud:origin,exp:Math.floor(Date.now()/1000)+3600,sub:'mailto:admin@ekodi.kr'})));
  const signed = jwtHeader+'.'+jwtPayload;
  const privateKey = await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,utf8(signed)));
  const encrypted = await encryptWebPush(payload,row.p256dh,row.auth_secret);
  const response = await transport(row.endpoint,{
    method:'POST',
    headers:{
      'authorization':'vapid t='+signed+'.'+b64(signature)+', k='+publicKey,
      'content-encoding':'aes128gcm',
      'content-type':'application/octet-stream',
      'ttl':'3600',
      'urgency':'normal'
    },
    body:encrypted,
    signal:AbortSignal.timeout(8000)
  });
  return {ok:response.ok,status:response.status};
}
