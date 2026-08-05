export function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function clampInteger(value: unknown, minimum: number, maximum: number, fallback = minimum): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}
