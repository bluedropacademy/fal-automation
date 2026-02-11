"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2, Images, ArrowRight } from "lucide-react";
import { useBatch } from "@/hooks/useBatch";
import { loadBatchHistory, deleteBatchFromHistory } from "@/lib/persistence";
import type { Batch } from "@/types/batch";

export function BatchHistory() {
  const { state, dispatch, hydrated } = useBatch();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [open, setOpen] = useState(false);

  // Load history on mount and when current batch status changes (archiving)
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    loadBatchHistory().then((history) => {
      if (!cancelled) setBatches(history);
    });
    return () => { cancelled = true; };
  }, [hydrated, state.currentBatch?.status]);

  const refreshHistory = useCallback(async () => {
    const history = await loadBatchHistory();
    setBatches(history);
  }, []);

  const handleLoad = useCallback(
    (batch: Batch) => {
      dispatch({ type: "VIEW_HISTORY_BATCH", batch });
    },
    [dispatch]
  );

  const handleBack = useCallback(() => {
    dispatch({ type: "BACK_TO_CURRENT" });
  }, [dispatch]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, batchId: string) => {
      e.stopPropagation();
      await deleteBatchFromHistory(batchId);
      refreshHistory();
    },
    [refreshHistory]
  );

  if (batches.length === 0) return null;

  const statusLabel: Record<string, string> = {
    completed: "הושלם",
    cancelled: "בוטל",
    error: "שגיאה",
    interrupted: "נותק",
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-sm font-semibold text-foreground"
      >
        <span>היסטוריית באצ׳ים ({batches.length})</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          {state.viewingHistory && (
            <button
              onClick={handleBack}
              className="flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-2.5 py-2 text-right text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              חזרה לבאצ׳ הנוכחי
            </button>
          )}
          {batches.map((batch) => {
            const completedCount = batch.images.filter(
              (img) => img.status === "completed"
            ).length;
            const isActive = state.currentBatch?.id === batch.id;

            return (
              <button
                key={batch.id}
                onClick={() => handleLoad(batch)}
                className={`group flex items-start gap-2 rounded-md border px-2.5 py-2 text-right transition-colors ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                <Images className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {batch.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {completedCount}/{batch.images.length} תמונות
                    {" · "}
                    {statusLabel[batch.status] ?? batch.status}
                    {" · "}
                    {new Date(batch.createdAt).toLocaleDateString("he-IL")}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, batch.id)}
                  className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-opacity"
                  title="מחק מההיסטוריה"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
