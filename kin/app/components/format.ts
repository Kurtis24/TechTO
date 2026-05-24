/** Format integer cents → "$1,650.00" (CAD). Accepts number or bigint. */
export function formatMoney(cents: number | bigint | undefined | null): string {
  if (cents === undefined || cents === null) return "—";
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return (n / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}

/** Short form: $1,650 (no cents). */
export function formatMoneyShort(cents: number | bigint | undefined | null): string {
  if (cents === undefined || cents === null) return "—";
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return (n / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

export function relativeDate(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  const day = 86_400_000;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString("en-CA");
}
