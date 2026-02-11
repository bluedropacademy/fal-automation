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

  const eta = useMemo(() => {
    if (!batch || batch.status !== "running" || !stats || stats.completed === 0) return null;
    const avgDurationMs = stats.totalDuration / stats.completed;
    const remaining = stats.total - stats.done;
    const concurrency = batch.settings.concurrency ?? 2;
    return (remaining / concurrency) * avgDurationMs;
  }, [batch, stats]);

  if (!batch || !stats) return null;

  const statusLabels: Record<string, string> = {
    idle: "",
    running: "מייצר...",
    completed: "הושלם!",
    cancelled: "בוטל",
    error: "שגיאה",
    interrupted: "נותק — ניתן להמשיך",
  };

  const isRunning = batch.status === "running";
  const barColor =
    batch.status === "error" || stats.failed === stats.total
      ? "bg-destructive"
      : batch.status === "completed"
        ? "bg-success"
        : "bg-gradient-to-l from-indigo-500 to-indigo-400";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">
          {statusLabels[batch.status] ?? ""}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {stats.done}/{stats.total} ({stats.percentage}%)
        </span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor} ${
            isRunning ? "progress-bar-animated" : ""
          }`}
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>{stats.completed} הצליחו</span>
        {stats.failed > 0 && (
          <span className="text-destructive">{stats.failed} נכשלו</span>
        )}
        {stats.totalDuration > 0 && (
          <span>זמן: {formatDuration(stats.totalDuration)}</span>
        )}
        {eta !== null && (
          <span className="font-medium text-foreground">
            ~{formatDuration(eta)} נותרו
          </span>
        )}
      </div>
    </div>
  );
}
