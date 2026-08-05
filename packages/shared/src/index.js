export function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function clampInteger(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}
