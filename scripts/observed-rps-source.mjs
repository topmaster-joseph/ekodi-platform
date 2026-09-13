export function pickRps(a, b, c) {
  for (const item of [a, b, c]) {
    const value = Number(item);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}
