/** Display formatting shared by the engine's explanations and the UI. */

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function formatMoney(amount: number): string {
  return `৳${Math.round(amount).toLocaleString('en-US')}`;
}

/** Compact money for dense table cells: ৳32.5k */
export function formatMoneyShort(amount: number): string {
  if (Math.abs(amount) >= 100_000) return `৳${(amount / 100_000).toFixed(1)}L`;
  if (Math.abs(amount) >= 1_000) return `৳${(amount / 1_000).toFixed(1)}k`;
  return `৳${Math.round(amount)}`;
}
