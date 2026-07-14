export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** "opened 12m ago" style relative time, for the Held Orders list. */
export function formatRelativeTime(ms: number): string {
  const diffMs = Date.now() - ms;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
