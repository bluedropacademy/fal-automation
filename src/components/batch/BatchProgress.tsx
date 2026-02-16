"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { useBatch } from "@/hooks/useBatch";
import { formatDuration } from "@/lib/format-utils";

export function BatchProgress() {
  const { state } = useBatch();
  const batch = state.currentBatch;
  const [showErrors, setShowErrors] = useState(false);

  const stats = useMemo(() => {
    if (!batch) return null;
    const total = batch.images.length;
    const completed = batch.images.filter((img) => img.status === "completed").length;
    const failed = batch.images.filter((img) => img.status === "failed").length;
    const done = completed + failed;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    const totalDuration = batch.images.reduce((sum, img) => sum + (img.durationMs || 0), 0);

    // Collect unique error messages with counts
    const errorMap = new Map<string, number>();
    batch.images.forEach((img) => {
      if (img.status === "failed" && img.error) {
        errorMap.set(img.error, (errorMap.get(img.error) ?? 0) + 1);
      }
    });
    const errors = Array.from(errorMap.entries()).map(([message, count]) => ({
      message,
      count,
    }));

    return { total, completed, failed, done, percentage, totalDuration, errors };
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
    interrupted: "הושהה — ניתן להמשיך",
  };

  const isRunning = batch.status === "running";
  const barColor =
    batch.status === "error" || stats.failed === stats.total
      ? "bg-destructive"
      : batch.status === "completed"
        ? "bg-success"
        : "bg-gradient-to-l from-indigo-500 to-indigo-400";

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">
          {statusLabels[batch.status] ?? ""}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {stats.done}/{stats.total} ({stats.percentage}%)
        </span>
      </div>

      <div className="h-3.5 w-full overflow-hidden rounded-full bg-muted/70">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor} ${
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

      {/* Error details panel */}
      {stats.failed > 0 && stats.errors.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-2 text-xs font-medium text-destructive w-full"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{stats.failed} תמונות נכשלו — לחץ לפרטים</span>
            <ChevronDown className={`h-3 w-3 mr-auto transition-transform ${showErrors ? "rotate-180" : ""}`} />
          </button>
          {showErrors && (
            <ul className="mt-2 space-y-1">
              {stats.errors.map((err, i) => (
                <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                  <span className="text-red-400 mt-0.5 shrink-0">&#x2022;</span>
                  <span className="flex-1 break-words" dir="ltr">{err.message}</span>
                  {err.count > 1 && (
                    <span className="text-red-400 whitespace-nowrap shrink-0">({err.count}x)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
