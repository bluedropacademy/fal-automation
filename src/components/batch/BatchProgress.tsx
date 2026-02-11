"use client";

import { useMemo } from "react";
import { useBatch } from "@/hooks/useBatch";
import { formatDuration } from "@/lib/format-utils";

export function BatchProgress() {
  const { state } = useBatch();
  const batch = state.currentBatch;

  const stats = useMemo(() => {
    if (!batch) return null;
    const total = batch.images.length;
    const completed = batch.images.filter((img) => img.status === "completed").length;
    const failed = batch.images.filter((img) => img.status === "failed").length;
    const done = completed + failed;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    const totalDuration = batch.images.reduce((sum, img) => sum + (img.durationMs || 0), 0);

    return { total, completed, failed, done, percentage, totalDuration };
  }, [batch]);

  if (!batch || !stats) return null;

  const statusText = {
    idle: "",
    running: "מייצר...",
    completed: "הושלם!",
    cancelled: "בוטל",
    error: "שגיאה",
  }[batch.status];

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{statusText}</span>
        <span className="text-sm text-muted-foreground">
          {stats.done}/{stats.total} ({stats.percentage}%)
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            batch.status === "error" || stats.failed === stats.total
              ? "bg-destructive"
              : batch.status === "completed"
                ? "bg-success"
                : "bg-primary"
          }`}
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span>{stats.completed} הצליחו</span>
        {stats.failed > 0 && (
          <span className="text-destructive">{stats.failed} נכשלו</span>
        )}
        {stats.totalDuration > 0 && (
          <span>זמן: {formatDuration(stats.totalDuration)}</span>
        )}
      </div>
    </div>
  );
}
