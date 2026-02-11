"use client";

import { useCallback, useRef } from "react";
import { useBatchContext } from "@/context/BatchContext";
import type { GenerationEvent, GenerationRequest } from "@/types/generation";
import type { Batch, BatchImage } from "@/types/batch";
import { generateBatchId } from "@/lib/format-utils";
import { estimateCost } from "@/lib/constants";

export function useGenerationStream() {
  const { state, dispatch } = useBatchContext();
  const abortControllerRef = useRef<AbortController | null>(null);

  const startGeneration = useCallback(
    async (prompts: string[]) => {
      const { settings } = state;
      const batchId = generateBatchId();

      const images: BatchImage[] = prompts.map((prompt, index) => ({
        index,
        rawPrompt: prompt,
        fullPrompt: [settings.promptPrefix, prompt, settings.promptSuffix]
          .filter(Boolean)
          .join(" ")
          .trim(),
        status: "pending" as const,
      }));

      const batch: Batch = {
        id: batchId,
        name: `באצ׳ ${batchId}`,
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
        const decoder = new TextDecoder();
        let buffer = "";

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
              dispatch({
                type: "UPDATE_IMAGE",
                index: event.index,
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

  return { startGeneration, cancelGeneration };
}
