"use client";

import type { ImageStatus } from "@/types/batch";

const statusConfig: Record<ImageStatus, { label: string; className: string }> = {
  pending: { label: "ממתין", className: "bg-muted text-muted-foreground" },
  queued: { label: "בתור", className: "bg-blue-100 text-blue-700" },
  processing: { label: "מייצר...", className: "bg-primary/10 text-primary animate-pulse" },
  completed: { label: "הושלם", className: "bg-green-100 text-green-700" },
  failed: { label: "נכשל", className: "bg-red-100 text-red-700" },
  editing: { label: "עורך...", className: "bg-amber-100 text-amber-700 animate-pulse" },
};

export function StatusBadge({ status }: { status: ImageStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
