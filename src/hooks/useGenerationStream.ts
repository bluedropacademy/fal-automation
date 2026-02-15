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

/**
 * Process SSE stream from /api/generate.
 * Returns true if a batch_complete event was received (clean finish).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dispatch: (action: any) => void,
  indexMap?: Map<number, number>
): Promise<boolean> {
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBatchComplete = false;

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
          receivedBatchComplete = true;
          dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
        } else if (event.type === "batch_error") {
          dispatch({ type: "SET_BATCH_STATUS", status: "error" });
        }
      }
    }
    return receivedBatchComplete;
  })();
}

export function useGenerationStream() {
  const { state, dispatch } = useBatchContext();
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunning = state.currentBatch?.status === "running";

  // Prevent sleep during active generation
  useWakeLock(isRunning ?? false);

  /**
   * Reconcile client state with server logs.
   * Catches images that completed/failed on the server but whose SSE events were lost.
   * Returns "completed" if all images are done, "interrupted" otherwise.
   */
  const reconcileWithServer = useCallback(
    async (batch: Batch): Promise<"completed" | "interrupted"> => {
      try {
        const dateStr = batch.createdAt.slice(0, 10);
        const res = await fetch(
          `/api/batch-status?batchId=${batch.id}&date=${dateStr}`
        );
        const data = await res.json();

        // Update images that completed on server but client doesn't know about
        for (const completed of data.completedIndices) {
          const img = batch.images[completed.index];
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
                  contentType: `image/${batch.settings.outputFormat}`,
                },
                completedAt: new Date().toISOString(),
              },
            });
          }
        }

        // Update images that failed on server but client shows as still pending/processing
        for (const failed of data.failedIndices) {
          const failedIndex = typeof failed === "number" ? failed : failed.index;
          const failedError = typeof failed === "number" ? "נכשל בצד השרת" : (failed.error ?? "נכשל בצד השרת");
          const img = batch.images[failedIndex];
          if (img && img.status !== "completed" && img.status !== "failed") {
            dispatch({
              type: "UPDATE_IMAGE",
              index: failedIndex,
              update: {
                status: "failed" as const,
                error: failedError,
                completedAt: new Date().toISOString(),
              },
            });
          }
        }

        const totalProcessed = data.completedIndices.length + data.failedIndices.length;
        if (totalProcessed >= batch.images.length) {
          dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
          return "completed";
        } else {
          dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
          return "interrupted";
        }
      } catch {
        dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
        return "interrupted";
      }
    },
    [dispatch]
  );

  // Detect sleep/wake and reconcile state
  const handleSleepDetected = useCallback(async () => {
    if (!state.currentBatch || state.currentBatch.status !== "running") return;

    const result = await reconcileWithServer(state.currentBatch);
    if (result === "completed") {
      toast.info("הבאצ׳ הושלם בזמן שהמחשב ישן");
    } else {
      toast.warning("החיבור נותק (מצב שינה?)", {
        description: "ניתן להמשיך את הבאצ׳.",
        duration: 10000,
      });
    }
  }, [state.currentBatch, reconcileWithServer]);

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
          settings.enableWebSearch,
          settings.provider
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
        const batchComplete = await processSSEStream(reader, dispatch);

        // Stream ended without batch_complete → reconcile with server logs
        if (!batchComplete) {
          const result = await reconcileWithServer(batch);
          if (result === "interrupted") {
            toast.warning("החיבור לשרת נותק", {
              description: "חלק מהתמונות הושלמו. ניתן להמשיך את הבאצ׳.",
              duration: 10000,
            });
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // User paused — set interrupted so they can resume
          dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
          // Reconcile to catch any in-flight completions
          await reconcileWithServer(batch);
        } else {
          // Connection error — reconcile and mark interrupted
          await reconcileWithServer(batch);
          toast.warning("החיבור לשרת נותק", {
            description: error instanceof Error ? error.message : "שגיאה לא ידועה",
            duration: 10000,
          });
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [state, dispatch, reconcileWithServer]
  );

  const pauseGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resumeGeneration = useCallback(async () => {
    if (!state.currentBatch) return;

    const batch = state.currentBatch;

    // First reconcile with server to catch any images that completed but we missed
    await reconcileWithServer(batch);

    // Re-read batch state after reconciliation (use fresh reference)
    const freshBatch = state.currentBatch;
    if (!freshBatch) return;

    // Include failed, pending, queued, and stuck processing images in resume
    const retryableImages = freshBatch.images.filter(
      (img) => img.status === "pending" || img.status === "queued" || img.status === "failed" || img.status === "processing"
    );

    if (retryableImages.length === 0) {
      dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
      toast.info("כל התמונות כבר עובדו");
      return;
    }

    // Reset failed/stuck images to pending before retrying
    for (const img of retryableImages) {
      if (img.status === "failed" || img.status === "processing") {
        dispatch({
          type: "UPDATE_IMAGE",
          index: img.index,
          update: {
            status: "pending" as const,
            error: undefined,
            completedAt: undefined,
            durationMs: undefined,
          },
        });
      }
    }

    // Map from new sequential indices (0,1,2...) to actual batch indices
    const indexMap = new Map<number, number>();
    const pendingPrompts: string[] = [];
    retryableImages.forEach((img, seqIdx) => {
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
      const batchComplete = await processSSEStream(reader, dispatch, indexMap);

      // Stream ended without batch_complete → reconcile
      if (!batchComplete) {
        const result = await reconcileWithServer(batch);
        if (result === "interrupted") {
          toast.warning("החיבור לשרת נותק", {
            description: "חלק מהתמונות הושלמו. ניתן להמשיך את הבאצ׳.",
            duration: 10000,
          });
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
        await reconcileWithServer(batch);
      } else {
        await reconcileWithServer(batch);
        toast.warning("החיבור לשרת נותק", {
          description: error instanceof Error ? error.message : "שגיאה לא ידועה",
          duration: 10000,
        });
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.currentBatch, dispatch, reconcileWithServer]);

  return { startGeneration, pauseGeneration, resumeGeneration };
}
