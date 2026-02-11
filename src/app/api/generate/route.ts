import { NextRequest } from "next/server";
import { appendLog } from "@/lib/file-utils";
import { PRICING, KIE_PRICING, WEB_SEARCH_ADDON_PRICE, USD_TO_ILS, MAX_CONCURRENCY } from "@/lib/constants";
import { getProvider } from "@/lib/providers";
import type { GenerationRequest, GenerationEvent } from "@/types/generation";
import type { LogEntry } from "@/types/log";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerationRequest;
  const { batchId, prompts, settings } = body;
  const concurrency = Math.min(Math.max(settings.concurrency ?? 1, 1), MAX_CONCURRENCY);
  const providerName = settings.provider ?? "fal";
  const provider = getProvider(providerName);
  const pricingTable = providerName === "kie" ? KIE_PRICING : PRICING;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: GenerationEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Shared index counter for worker pool
      let nextIndex = 0;

      async function processImage(i: number): Promise<void> {
        const fullPrompt = [settings.promptPrefix, prompts[i], settings.promptSuffix]
          .filter(Boolean)
          .join(" ")
          .trim();

        const startTime = Date.now();

        sendEvent({ type: "image_update", index: i, status: "queued" });

        try {
          const result = await provider.generateImage(
            {
              prompt: fullPrompt,
              resolution: settings.resolution,
              aspectRatio: settings.aspectRatio,
              outputFormat: settings.outputFormat,
              safetyTolerance: settings.safetyTolerance,
              numImages: providerName === "kie" ? 1 : settings.numImages,
              seed: settings.seed,
              enableWebSearch: settings.enableWebSearch,
              referenceImageUrls: settings.referenceImageUrls,
            },
            (status) => {
              sendEvent({ type: "image_update", index: i, status });
            }
          );

          const durationMs = Date.now() - startTime;
          const image = result.images[0];

          sendEvent({
            type: "image_update",
            index: i,
            status: "completed",
            image: {
              url: image.url,
              contentType: image.contentType,
              width: image.width,
              height: image.height,
            },
            seed: result.seed,
            requestId: result.requestId,
            durationMs,
          });

          const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            batchId,
            imageIndex: i,
            prompt: fullPrompt,
            parameters: {
              provider: providerName,
              resolution: settings.resolution,
              aspectRatio: settings.aspectRatio,
              outputFormat: settings.outputFormat,
              safetyTolerance: settings.safetyTolerance,
              numImages: settings.numImages,
              seed: settings.seed,
              enableWebSearch: settings.enableWebSearch,
              hasReferenceImages: settings.referenceImageUrls.length > 0,
            },
            status: "completed",
            durationMs,
            resultUrl: image.url,
            width: image.width,
            height: image.height,
            requestId: result.requestId,
            cost: ((pricingTable[settings.resolution] ?? 0.15) + (providerName === "fal" && settings.enableWebSearch ? WEB_SEARCH_ADDON_PRICE : 0)) * USD_TO_ILS,
          };
          await appendLog(logEntry);
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          sendEvent({
            type: "image_update",
            index: i,
            status: "failed",
            error: errorMessage,
            durationMs,
          });

          const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            batchId,
            imageIndex: i,
            prompt: fullPrompt,
            parameters: {
              provider: providerName,
              resolution: settings.resolution,
              aspectRatio: settings.aspectRatio,
              outputFormat: settings.outputFormat,
              safetyTolerance: settings.safetyTolerance,
              numImages: settings.numImages,
              seed: settings.seed,
              enableWebSearch: settings.enableWebSearch,
              hasReferenceImages: settings.referenceImageUrls.length > 0,
            },
            status: "failed",
            durationMs,
            error: errorMessage,
            cost: 0,
          };
          await appendLog(logEntry);
        }
      }

      // Worker pool: each worker grabs the next available index
      async function worker(): Promise<void> {
        while (nextIndex < prompts.length) {
          if (request.signal.aborted) return;
          const i = nextIndex++;
          if (i >= prompts.length) return;
          await processImage(i);
        }
      }

      // Launch N workers in parallel
      const workers = Array.from(
        { length: Math.min(concurrency, prompts.length) },
        () => worker()
      );
      await Promise.all(workers);

      sendEvent({ type: "batch_complete" });

      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
