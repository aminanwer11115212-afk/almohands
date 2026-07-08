/**
 * Currency formatters for Sudanese Pound (SDG).
 * Uses non-breaking spaces so the label "جنيه سوداني" never wraps
 * onto a new line and doesn't get clipped inside narrow table cells.
 */
const NBSP = "\u00A0";

export function formatSDG(value: number): string {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  return `${n}${NBSP}جنيه${NBSP}سوداني`;
}

/** Short form for very narrow places (thermal receipt, cashier rows). */
export function formatSDGShort(value: number): string {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  return `${n}${NBSP}ج.س`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
