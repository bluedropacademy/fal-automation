import { NextRequest } from "next/server";
import { fal } from "@/lib/fal-server";
import { appendLog } from "@/lib/file-utils";
import { FAL_MODEL_TEXT_TO_IMAGE, FAL_MODEL_IMAGE_EDIT, PRICING, WEB_SEARCH_ADDON_PRICE, USD_TO_ILS, MAX_CONCURRENCY } from "@/lib/constants";
import type { GenerationRequest, GenerationEvent } from "@/types/generation";
import type { LogEntry } from "@/types/log";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerationRequest;
  const { batchId, prompts, settings } = body;
  const concurrency = Math.min(Math.max(settings.concurrency ?? 1, 1), MAX_CONCURRENCY);

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

      const endpoint =
        settings.referenceImageUrls.length > 0
          ? FAL_MODEL_IMAGE_EDIT
          : FAL_MODEL_TEXT_TO_IMAGE;

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
          const input: Record<string, unknown> = {
            prompt: fullPrompt,
            num_images: settings.numImages,
            resolution: settings.resolution,
            aspect_ratio: settings.aspectRatio,
            output_format: settings.outputFormat,
            safety_tolerance: String(settings.safetyTolerance),
            enable_web_search: settings.enableWebSearch,
          };

          if (settings.seed !== undefined) {
            input.seed = settings.seed;
          }

          if (settings.referenceImageUrls.length > 0) {
            input.image_urls = settings.referenceImageUrls;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (fal as any).subscribe(endpoint, {
            input,
            onQueueUpdate: (update: { status: string }) => {
              if (update.status === "IN_PROGRESS") {
                sendEvent({ type: "image_update", index: i, status: "processing" });
              }
            },
          });

          const durationMs = Date.now() - startTime;
          const data = result.data as {
            images: Array<{
              url: string;
              content_type: string;
              width: number;
              height: number;
            }>;
            seed?: number;
          };
          const image = data.images[0];

          sendEvent({
            type: "image_update",
            index: i,
            status: "completed",
            image: {
              url: image.url,
              contentType: image.content_type,
              width: image.width,
              height: image.height,
            },
            seed: data.seed,
            requestId: result.requestId,
            durationMs,
          });

          const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            batchId,
            imageIndex: i,
            prompt: fullPrompt,
            parameters: {
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
            cost: ((PRICING[settings.resolution] ?? 0.15) + (settings.enableWebSearch ? WEB_SEARCH_ADDON_PRICE : 0)) * USD_TO_ILS,
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
