const SAFE_PROTOCOLS = new Set(['rtsp','onvif','matter']);
const SAFE_CAPABILITIES = new Set(['camera.live','camera.status']);

function text(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function safeId(value) {
  const id = text(value, 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(id)) throw new Error('TAPO_DEVICE_ID_INVALID');
  return id;
}

function containsPrivateTopology(value) {
  const s = String(value || '').toLowerCase();
  return /(?:rtsp|onvif):\/\//.test(s)
    || /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/.test(s)
    || /"(?:username|password|secret|token|rtspurl|ip|host)"\s*:/i.test(s);
}

export function tapoSupports(device, capability) {
  const projected = projectTapoDeviceForCloud(device);
  return projected.capabilities.includes(capability);
}
export function projectTapoDeviceForCloud(raw = {}, bridgeId = '') {
  const externalId = safeId(raw.externalId || raw.id);
  const type = text(raw.type || 'camera', 32).toLowerCase();
  if (type !== 'camera') throw new Error('TAPO_DEVICE_TYPE_UNSUPPORTED');
  const protocols = [...new Set((Array.isArray(raw.protocols) ? raw.protocols : ['rtsp'])
    .map(item => text(item, 20).toLowerCase()).filter(item => SAFE_PROTOCOLS.has(item)))];
  const capabilities = [...new Set((Array.isArray(raw.capabilities) ? raw.capabilities : ['camera.live','camera.status'])
    .map(item => text(item, 40)).filter(item => SAFE_CAPABILITIES.has(item)))];
  const projected = {
    externalId,
    label: text(raw.label || externalId, 80),
    type: 'camera',
    model: text(raw.model, 80),
    locationLabel: text(raw.locationLabel, 120),
    protocols,
    capabilities,
    provider: 'tp-link.tapo',
    credentialRef: `edge-local://tapo/${text(bridgeId || 'bridge', 100)}/${externalId}`,
  };
  assertSafeTapoCloudProjection(projected);
  return projected;
}

export function assertSafeTapoCloudProjection(value) {
  const encoded = JSON.stringify(value);
  if (containsPrivateTopology(encoded)) throw new Error('TAPO_CLOUD_PROJECTION_UNSAFE');
  if (!String(value?.credentialRef || '').startsWith('edge-local://')) throw new Error('TAPO_CREDENTIAL_BOUNDARY_INVALID');
  return true;
}
