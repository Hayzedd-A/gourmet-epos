export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
