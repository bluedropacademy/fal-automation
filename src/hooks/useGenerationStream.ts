"use client";

import { useCallback, useRef, useEffect } from "react";
import { useBatchContext } from "@/context/BatchContext";
import type { GenerationEvent, GenerationRequest } from "@/types/generation";
import type { Batch, BatchImage } from "@/types/batch";
import { generateBatchId, uid } from "@/lib/format-utils";
import { estimateCost } from "@/lib/constants";
import { saveActiveQStashBatchId } from "@/lib/persistence";
import { toast } from "sonner";
import { useWakeLock } from "./useWakeLock";
import { useSleepDetector } from "./useSleepDetector";
import type { BatchProgress } from "@/types/qstash";

type Mode = "sse" | "qstash";

const POLL_INTERVAL_ACTIVE = 3000;
const POLL_INTERVAL_SLOW = 5000;

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
  const modeRef = useRef<Mode>("sse");
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingBatchIdRef = useRef<string | null>(null);
  const pollGenerationRef = useRef(0);
  const batchRef = useRef(state.currentBatch);
  batchRef.current = state.currentBatch;
  const isRunning = state.currentBatch?.status === "running";

  // Prevent sleep during active generation
  useWakeLock(isRunning ?? false);

  // --- SSE reconciliation (same as before) ---

  const reconcileWithServer = useCallback(
    async (batch: Batch): Promise<"completed" | "interrupted"> => {
      try {
        const dateStr = batch.createdAt.slice(0, 10);
        const res = await fetch(
          `/api/batch-status?batchId=${batch.id}&date=${dateStr}`
        );
        const data = await res.json();

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

  // Detect sleep/wake — in SSE mode reconcile, in QStash mode just poll
  const handleSleepDetected = useCallback(async () => {
    if (!state.currentBatch || state.currentBatch.status !== "running") return;

    if (modeRef.current === "qstash") {
      // QStash: jobs continue in the background, just poll again
      return;
    }

    // SSE mode: reconcile
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

  // --- QStash polling ---

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    pollingBatchIdRef.current = null;
  }, []);

  const pollOnce = useCallback(
    async (batchId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/batch/progress?batchId=${batchId}`);
        if (!res.ok) return false;
        const progress: BatchProgress = await res.json();

        for (const [indexStr, imgState] of Object.entries(progress.images)) {
          const index = Number(indexStr);
          const update: Partial<BatchImage> = { status: imgState.status };

          if (imgState.result) update.result = imgState.result;
          if (imgState.seed !== undefined) update.seed = imgState.seed;
          if (imgState.requestId) update.requestId = imgState.requestId;
          if (imgState.error) update.error = imgState.error;
          if (imgState.durationMs !== undefined) update.durationMs = imgState.durationMs;
          if (imgState.status === "completed" || imgState.status === "failed") {
            update.completedAt = new Date().toISOString();
          }

          dispatch({ type: "UPDATE_IMAGE", index, update });
        }

        if (progress.status === "completed") {
          dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
          await saveActiveQStashBatchId(null);
          return true;
        }

        return false;
      } catch (error) {
        console.error("[QStash poll] Error:", error);
        return false;
      }
    },
    [dispatch]
  );

  const startPolling = useCallback(
    (batchId: string) => {
      pollingBatchIdRef.current = batchId;
      const generation = ++pollGenerationRef.current;

      const poll = async () => {
        if (pollGenerationRef.current !== generation) return;

        const done = await pollOnce(batchId);
        if (done) {
          pollingRef.current = null;
          return;
        }

        // Bail if a newer generation started while we were polling
        if (pollGenerationRef.current !== generation) return;

        // Smart interval — use ref to always read latest batch state
        const batch = batchRef.current;
        const hasPending = batch?.images.some(
          (img) => img.status === "pending" || img.status === "queued"
        );
        const interval = hasPending ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_SLOW;
        pollingRef.current = setTimeout(poll, interval);
      };

      poll();
    },
    [pollOnce]
  );

  // Immediately recover QStash polling when tab becomes visible.
  // Chrome throttles/freezes setTimeout in background tabs, which can kill
  // the polling loop. This handler restarts it the moment the user returns.
  useEffect(() => {
    if (!isRunning) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (modeRef.current !== "qstash") return;

      const batchId = pollingBatchIdRef.current;
      if (!batchId) return;

      // Kill any stale/throttled timer and restart fresh
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      startPolling(batchId);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isRunning, startPolling]);

  // --- QStash start ---

  const startViaQStash = useCallback(
    async (batchId: string, batchName: string, prompts: string[], batch: Batch) => {
      modeRef.current = "qstash";

      try {
        const res = await fetch("/api/batch/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId,
            batchName,
            prompts,
            settings: batch.settings,
          }),
        });

        if (res.status === 501) {
          // QStash not configured — return false to fall back to SSE
          return false;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${res.status}`);
        }

        // Save for reconnect after browser close
        await saveActiveQStashBatchId(batchId);

        // Mark all as queued
        for (let i = 0; i < prompts.length; i++) {
          dispatch({
            type: "UPDATE_IMAGE",
            index: i,
            update: { status: "queued", startedAt: new Date().toISOString() },
          });
        }

        // Start polling
        startPolling(batchId);
        return true;
      } catch (error) {
        dispatch({ type: "SET_BATCH_STATUS", status: "error" });
        toast.error("שגיאה בהפעלת הבאצ׳", {
          description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        });
        return true; // Don't fall back to SSE on real errors
      }
    },
    [dispatch, startPolling]
  );

  // --- SSE start ---

  const startViaSSE = useCallback(
    async (batchId: string, prompts: string[], batch: Batch) => {
      modeRef.current = "sse";

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const request: GenerationRequest = {
        batchId,
        prompts,
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
        const batchComplete = await processSSEStream(reader, dispatch);

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
    },
    [dispatch, reconcileWithServer]
  );

  // --- Public API ---

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
        type: "image",
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

      // Try QStash first; if 501 (not configured), fall back to SSE
      const usedQStash = await startViaQStash(batchId, batchName, prompts, batch);
      if (!usedQStash) {
        await startViaSSE(batchId, prompts, batch);
      }
    },
    [state, dispatch, startViaQStash, startViaSSE]
  );

  const pauseGeneration = useCallback(() => {
    if (modeRef.current === "qstash") {
      // QStash: stop polling (jobs still run in background)
      stopPolling();
      dispatch({ type: "SET_BATCH_STATUS", status: "interrupted" });
    } else {
      // SSE: abort the fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [stopPolling, dispatch]);

  const resumeGeneration = useCallback(async () => {
    if (!state.currentBatch) return;
    const batch = state.currentBatch;

    if (modeRef.current === "qstash") {
      // QStash: just resume polling — jobs are still running in the background
      dispatch({ type: "SET_BATCH_STATUS", status: "running" });
      await saveActiveQStashBatchId(batch.id);
      startPolling(batch.id);
      return;
    }

    // SSE mode: reconcile and re-send pending prompts
    await reconcileWithServer(batch);

    const freshBatch = state.currentBatch;
    if (!freshBatch) return;

    const retryableImages = freshBatch.images.filter(
      (img) => img.status === "pending" || img.status === "queued" || img.status === "failed" || img.status === "processing"
    );

    if (retryableImages.length === 0) {
      dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
      toast.info("כל התמונות כבר עובדו");
      return;
    }

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
  }, [state.currentBatch, dispatch, reconcileWithServer, startPolling, stopPolling]);

  /** Reconnect to a QStash batch after browser was closed */
  const reconnectQStashBatch = useCallback(
    async (batchId: string) => {
      modeRef.current = "qstash";

      try {
        const res = await fetch(`/api/batch/progress?batchId=${batchId}`);
        if (!res.ok) {
          await saveActiveQStashBatchId(null);
          return;
        }

        const progress: BatchProgress = await res.json();

        if (progress.status === "completed") {
          // Batch finished while browser was closed — update UI
          for (const [indexStr, imgState] of Object.entries(progress.images)) {
            const index = Number(indexStr);
            dispatch({
              type: "UPDATE_IMAGE",
              index,
              update: {
                status: imgState.status,
                ...(imgState.result && { result: imgState.result }),
                ...(imgState.seed !== undefined && { seed: imgState.seed }),
                ...(imgState.requestId && { requestId: imgState.requestId }),
                ...(imgState.error && { error: imgState.error }),
                ...(imgState.durationMs !== undefined && { durationMs: imgState.durationMs }),
                completedAt: new Date().toISOString(),
              },
            });
          }
          dispatch({ type: "SET_BATCH_STATUS", status: "completed" });
          await saveActiveQStashBatchId(null);
          toast.info("הבאצ׳ הושלם בזמן שהדפדפן היה סגור");
          return;
        }

        // Batch still running — start polling
        dispatch({ type: "SET_BATCH_STATUS", status: "running" });
        startPolling(batchId);
        toast.info("מתחבר מחדש לבאצ׳ פעיל...");
      } catch {
        await saveActiveQStashBatchId(null);
      }
    },
    [dispatch, startPolling]
  );

  // --- Auto-reconnect QStash batch after hydration ---

  const reconnectedRef = useRef(false);

  useEffect(() => {
    if (reconnectedRef.current) return;
    if (!state.pendingQStashBatchId) return;

    reconnectedRef.current = true;
    const batchId = state.pendingQStashBatchId;
    dispatch({ type: "CLEAR_QSTASH_RECONNECT" });
    reconnectQStashBatch(batchId);
  }, [state.pendingQStashBatchId, dispatch, reconnectQStashBatch]);

  return { startGeneration, pauseGeneration, resumeGeneration, reconnectQStashBatch };
}
