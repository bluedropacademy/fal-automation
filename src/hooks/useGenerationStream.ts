"use client";

import { useCallback, useRef } from "react";
import { useBatchContext } from "@/context/BatchContext";
import type { GenerationEvent, GenerationRequest } from "@/types/generation";
import type { Batch, BatchImage } from "@/types/batch";
import { generateBatchId, uid } from "@/lib/format-utils";
import { estimateCost } from "@/lib/constants";
import { toast } from "sonner";
import { useWakeLock } from "./useWakeLock";
import { useSleepDetector } from "./useSleepDetector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dispatch: (action: any) => void,
  indexMap?: Map<number, number>
) {
  const decoder = new TextDecoder();
  let buffer = "";

  return (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;

        const event: GenerationEvent = JSON.parse(line.slice(6));

        if (event.type === "image_update" && event.index !== undefined) {
          const actualIndex = indexMap ? (indexMap.get(event.index) ?? event.index) : event.index;
          dispatch({
            type: "UPDATE_IMAGE",
            index: actualIndex,
            update: {
              status: event.status,
              ...(event.image && { result: event.image }),
              ...(event.seed !== undefined && { seed: event.seed }),
              ...(event.requestId && { requestId: event.requestId }),
              ...(event.error && { error: event.error }),
              ...(event.durationMs !== undefined && { durationMs: event.durationMs }),
              ...(event.status === "queued" && { startedAt: new Date().toISOString() }),
              ...(event.status === "completed" || event.status === "failed"
                ? { completedAt: new Date().toISOString() }
                : {}),
            },
          });
        } else if (event.type === "batch_complete") {
          dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
        } else if (event.type === "batch_error") {
          dispatch({ type: "SET_BATCH_STATUS", status: "error" });
        }
      }
    }
  })();
}

export function useGenerationStream() {
  const { state, dispatch } = useBatchContext();
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunning = state.currentBatch?.status === "running";

  // Prevent sleep during active generation
  useWakeLock(isRunning ?? false);

  // Detect sleep/wake and reconcile state
  const handleSleepDetected = useCallback(async () => {
    if (!state.currentBatch || state.currentBatch.status !== "running") return;

    // The SSE connection may be broken after sleep. Reconcile with server logs.
    try {
      const dateStr = state.currentBatch.createdAt.slice(0, 10);
      const res = await fetch(
        `/api/batch-status?batchId=${state.currentBatch.id}&date=${dateStr}`
      );
      const data = await res.json();

      // Update images that completed while we were asleep
      for (const completed of data.completedIndices) {
        const img = state.currentBatch.images[completed.index];
        if (img && img.status !== "completed") {
          dispatch({
            type: "UPDATE_IMAGE",
            index: completed.index,
            update: {
              status: "completed" as const,
              result: {
                url: completed.url,
                width: completed.width,
                height: completed.height,
                contentType: `image/${state.currentBatch.settings.outputFormat}`,
              },
              completedAt: new Date().toISOString(),
            },
          });
        }
      }

      const totalProcessed = data.completedIndices.length + data.failedIndices.length;
      if (totalProcessed >= state.currentBatch.images.length) {
        dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
        toast.info("הבאצ׳ הושלם בזמן שהמחשב ישן", {
          description: `${data.completedIndices.length} תמונות הושלמו`,
        });
      } else {
        dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
        toast.warning("החיבור נותק (מצב שינה?)", {
          description: `${totalProcessed}/${state.currentBatch.images.length} תמונות עובדו. ניתן להמשיך את הבאצ׳.`,
          duration: 10000,
        });
      }
    } catch {
      dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
      toast.error("החיבור לשרת נותק", {
        description: "ניתן לנסות להמשיך את הבאצ׳",
      });
    }
  }, [state.currentBatch, dispatch]);

  useSleepDetector({
    onSleepDetected: handleSleepDetected,
    enabled: isRunning ?? false,
    threshold: 10000,
  });

  const startGeneration = useCallback(
    async (prompts: string[]) => {
      const { settings } = state;
      const batchId = generateBatchId();

      const images: BatchImage[] = prompts.map((prompt, index) => ({
        id: uid(),
        index,
        rawPrompt: prompt,
        fullPrompt: [settings.promptPrefix, prompt, settings.promptSuffix]
          .filter(Boolean)
          .join(" ")
          .trim(),
        status: "pending" as const,
      }));

      const batchName = state.batchName.trim() || `באצ׳ ${batchId}`;

      const batch: Batch = {
        id: batchId,
        name: batchName,
        status: "running",
        images,
        settings,
        createdAt: new Date().toISOString(),
        estimatedCost: estimateCost(
          prompts.length,
          settings.numImages,
          settings.resolution,
          settings.enableWebSearch
        ),
      };

      dispatch({ type: "START_BATCH", batch });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const request: GenerationRequest = {
        batchId,
        prompts,
        settings,
      };

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body!.getReader();
        await processSSEStream(reader, dispatch);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          dispatch({ type: "SET_BATCH_STATUS", status: "cancelled" });
        } else {
          dispatch({ type: "SET_BATCH_STATUS", status: "error" });
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [state, dispatch]
  );

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resumeGeneration = useCallback(async () => {
    if (!state.currentBatch) return;

    const batch = state.currentBatch;
    const pendingImages = batch.images.filter(
      (img) => img.status === "pending" || img.status === "queued"
    );

    if (pendingImages.length === 0) {
      dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
      toast.info("כל התמונות כבר עובדו");
      return;
    }

    // Map from new sequential indices (0,1,2...) to actual batch indices
    const indexMap = new Map<number, number>();
    const pendingPrompts: string[] = [];
    pendingImages.forEach((img, seqIdx) => {
      indexMap.set(seqIdx, img.index);
      pendingPrompts.push(img.rawPrompt);
    });

    dispatch({ type: "SET_BATCH_STATUS", status: "running" });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const request: GenerationRequest = {
      batchId: batch.id,
      prompts: pendingPrompts,
      settings: batch.settings,
    };

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      await processSSEStream(reader, dispatch, indexMap);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({ type: "SET_BATCH_STATUS", status: "cancelled" });
      } else {
        dispatch({ type: "SET_BATCH_STATUS", status: "error" });
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.currentBatch, dispatch]);

  return { startGeneration, cancelGeneration, resumeGeneration };
}
