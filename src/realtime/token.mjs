import crypto from 'node:crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function issueRoomToken({ roomId, tenantId, userId, role, secret, ttlSeconds = 300, now = Date.now() }) {
  if (!secret || secret.length < 32) throw new Error('room_token_secret_too_short');
  const iat = Math.floor(now / 1000);
  const payload = { roomId, tenantId, userId, role, iat, exp: iat + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyRoomToken(token, { secret, expectedRoomId, expectedTenantId, now = Date.now() }) {
  if (!secret || secret.length < 32) throw new Error('room_token_secret_too_short');
  const [body, sig, extra] = String(token || '').split('.');
  if (!body || !sig || extra) throw new Error('invalid_room_token');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('invalid_room_token_signature');
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { throw new Error('invalid_room_token_payload'); }
  const current = Math.floor(now / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= current) throw new Error('room_token_expired');
  if (expectedRoomId && payload.roomId !== expectedRoomId) throw new Error('room_token_room_mismatch');
  if (expectedTenantId && payload.tenantId !== expectedTenantId) throw new Error('room_token_tenant_mismatch');
  return payload;
}
