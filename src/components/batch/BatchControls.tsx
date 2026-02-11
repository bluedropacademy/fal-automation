"use client";

import { useCallback } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { useGenerationStream } from "@/hooks/useGenerationStream";
import { parsePrompts } from "@/lib/constants";

export function BatchControls() {
  const { state } = useBatch();
  const { startGeneration, cancelGeneration } = useGenerationStream();
  const isRunning = state.currentBatch?.status === "running";
  const rawText = state.prompts.join("\n");
  const validPrompts = parsePrompts(rawText);

  const handleStart = useCallback(async () => {
    if (validPrompts.length === 0) {
      toast.error("אין פרומפטים", {
        description: "יש להזין לפחות פרומפט אחד",
      });
      return;
    }
    await startGeneration(validPrompts);
  }, [validPrompts, startGeneration]);

  const handleCancel = useCallback(() => {
    cancelGeneration();
    toast.info("הבאצ׳ בוטל", {
      description: "תמונות שכבר נוצרו נשמרו",
    });
  }, [cancelGeneration]);

  return (
    <div className="flex gap-2">
      {!isRunning ? (
        <button
          onClick={handleStart}
          disabled={validPrompts.length === 0}
          className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="h-4 w-4" />
          התחל יצירה
        </button>
      ) : (
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 rounded-md bg-destructive px-6 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
        >
          <Square className="h-4 w-4" />
          ביטול
        </button>
      )}
    </div>
  );
}
