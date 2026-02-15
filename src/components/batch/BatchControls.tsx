"use client";

import { useCallback, useEffect } from "react";
import { Play, Pause, RotateCcw, Plus, FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { useGenerationStream } from "@/hooks/useGenerationStream";
import { parsePrompts } from "@/lib/constants";

export function BatchControls() {
  const { state, dispatch } = useBatch();
  const { startGeneration, pauseGeneration, resumeGeneration } = useGenerationStream();
  const isRunning = state.currentBatch?.status === "running";
  const isInterrupted = state.currentBatch?.status === "interrupted";
  const isFinished =
    state.currentBatch?.status === "completed" ||
    state.currentBatch?.status === "cancelled" ||
    state.currentBatch?.status === "error";
  const rawText = state.prompts.join("\n");
  const validPrompts = parsePrompts(rawText);

  const stuckOrFailedCount = state.currentBatch?.images.filter(
    (img) => img.status === "failed" || img.status === "processing" || img.status === "queued" || img.status === "pending"
  ).length ?? 0;

  const handleStart = useCallback(async () => {
    if (validPrompts.length === 0) {
      toast.error("אין פרומפטים", {
        description: "יש להזין לפחות פרומפט אחד",
      });
      return;
    }
    await startGeneration(validPrompts);
  }, [validPrompts, startGeneration]);

  const handlePause = useCallback(() => {
    pauseGeneration();
    toast.info("הבאצ׳ הושהה", {
      description: "ניתן להמשיך בכל עת. תמונות שכבר נוצרו נשמרו.",
    });
  }, [pauseGeneration]);

  const handleResume = useCallback(async () => {
    await resumeGeneration();
  }, [resumeGeneration]);

  const handleNewBatch = useCallback(() => {
    dispatch({ type: "RESET_BATCH" });
  }, [dispatch]);

  // Ctrl+Enter shortcut to start generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && validPrompts.length > 0 && !isRunning) {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleStart, validPrompts.length, isRunning]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          שם הבאצ׳
        </label>
        <div className="relative">
          <FolderOpen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            type="text"
            value={state.batchName}
            onChange={(e) => dispatch({ type: "SET_BATCH_NAME", name: e.target.value })}
            placeholder="ייווצר אוטומטית אם ריק"
            disabled={isRunning}
            className="w-full rounded-lg border border-border bg-white pr-9 pl-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
      </div>

      {isRunning ? (
        <button
          onClick={handlePause}
          className="mt-5 flex items-center gap-2 rounded-lg border-2 border-amber-500 px-6 py-2.5 text-sm font-bold text-amber-600 hover:bg-amber-500 hover:text-white transition-all"
        >
          <Pause className="h-4 w-4" />
          השהה
        </button>
      ) : isInterrupted ? (
        <>
          <button
            onClick={handleResume}
            className="mt-5 flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-600 shadow-md transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            המשך באצ׳ ({stuckOrFailedCount} לא הושלמו)
          </button>
          <button
            onClick={handleNewBatch}
            className="mt-5 flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-gray-200 transition-colors"
          >
            <Plus className="h-4 w-4" />
            באצ׳ חדש
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleStart}
            disabled={validPrompts.length === 0}
            className="mt-5 flex items-center gap-2.5 rounded-lg bg-primary px-8 py-3 text-base font-bold text-primary-foreground hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none shadow-md hover:shadow-lg transition-all"
          >
            <Play className="h-5 w-5" />
            התחל יצירה
            <kbd className="mr-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-mono">
              Ctrl+Enter
            </kbd>
          </button>
          {isFinished && stuckOrFailedCount > 0 && (
            <button
              onClick={handleResume}
              className="mt-5 flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-600 shadow-md transition-all"
            >
              <RefreshCw className="h-4 w-4" />
              נסה שוב ({stuckOrFailedCount} לא הושלמו)
            </button>
          )}
          {isFinished && (
            <button
              onClick={handleNewBatch}
              className="mt-5 flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-gray-200 transition-colors"
            >
              <Plus className="h-4 w-4" />
              באצ׳ חדש
            </button>
          )}
        </>
      )}
    </div>
  );
}
