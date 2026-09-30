const SOURCES = new Set(['ads','affiliate','order','subscription','sponsor','service','other']);

const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export function minorAmount(value, label = 'amount') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
  return amount;
}

export function currencyCode(value = 'KRW') {
  const code = clean(value, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new TypeError('currency must be a 3-letter ISO code');
  return code;
}

export function normalizeRealizedRevenue(input = {}) {
  const provider = clean(input.provider, 80).toLowerCase();
  const externalRef = clean(input.externalRef, 220);
  const source = clean(input.source || 'other', 40).toLowerCase();
  if (!provider || !externalRef) throw new TypeError('provider and externalRef are required');
  if (!SOURCES.has(source)) throw new TypeError('unsupported revenue source');
  const gross = minorAmount(input.gross ?? input.amount ?? 0, 'gross');
  const fee = minorAmount(input.fee ?? 0, 'fee');
  if (fee > gross) throw new RangeError('fee cannot exceed gross');
  const net = input.net == null ? gross - fee : minorAmount(input.net, 'net');
  if (net !== gross - fee) throw new RangeError('net must equal gross - fee');
  return Object.freeze({
    eventKey: clean(input.eventKey, 220) || `${provider}:${externalRef}`,
    provider,
    externalRef,
    source,
    tenantKey: clean(input.tenantKey, 160),
    siteKey: clean(input.siteKey, 120),
    currency: currencyCode(input.currency),
    gross,
    fee,
    net,
    status: input.confirmed === true ? 'confirmed' : 'pending',
  });
}

export function allocateRealizedRevenue(totalMinor, splits) {
  const total = minorAmount(totalMinor, 'total');
  if (!Array.isArray(splits) || splits.length === 0) throw new TypeError('splits are required');
  const rows = splits.map((split, index) => {
    const bps = Number(split?.bps);
    const recipient = clean(split?.recipient, 180);
    if (!recipient) throw new TypeError(`splits[${index}].recipient is required`);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new TypeError(`splits[${index}].bps is invalid`);
    const numerator = total * bps;
    return { index, recipient, bps, amount: Math.floor(numerator / 10000), remainder: numerator % 10000 };
  });
  if (rows.reduce((sum, row) => sum + row.bps, 0) !== 10000) throw new RangeError('basis points must total 10000');
  const left = total - rows.reduce((sum, row) => sum + row.amount, 0);
  const priority = [...rows].sort((a,b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < left; i += 1) priority[i % priority.length].amount += 1;
  return rows.sort((a,b) => a.index - b.index).map(({index,remainder,...row}) => Object.freeze(row));
}

export function exposureOnlySignal(input = {}) {
  return Object.freeze({
    impressions: minorAmount(input.impressions ?? 0, 'impressions'),
    clicks: minorAmount(input.clicks ?? 0, 'clicks'),
    realizedRevenue: 0,
    status: 'non_monetary_signal',
  });
}
