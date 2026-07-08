/**
 * Currency formatters for Sudanese Pound (SDG).
 * Per user preference: the label "جنيه سوداني" is hidden across invoices
 * and dashboard to leave more room for the numeric value. The number is
 * shown on its own; currency context is implied by the app (SDG only).
 */
export function formatSDG(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Short form kept for backwards compatibility — also label-free. */
export function formatSDGShort(value: number): string {
  return formatSDG(value);
}


export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
