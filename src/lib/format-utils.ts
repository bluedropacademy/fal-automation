export function padIndex(index: number, total: number): string {
  const digits = Math.max(3, String(total).length);
  return String(index + 1).padStart(digits, "0");
}

export function sanitizeFilename(text: string): string {
  return text
    .substring(0, 40)
    .replace(/[^a-zA-Z0-9\s\-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "image";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatCost(cost: number): string {
  return `₪${cost.toFixed(2)}`;
}

export function formatCostILS(costUSD: number, rate: number): string {
  return `₪${(costUSD * rate).toFixed(2)}`;
}

let _uidCounter = 0;
export function uid(): string {
  return `${Date.now()}-${++_uidCounter}`;
}

export function generateBatchId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
