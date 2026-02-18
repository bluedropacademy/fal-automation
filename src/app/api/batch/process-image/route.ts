import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getProvider } from "@/lib/providers";
import { persistFile } from "@/lib/supabase-storage";
import { appendLog } from "@/lib/file-utils";
import {
  updateImageInRedis,
  getImageState,
  type ImageJobPayload,
} from "@/lib/qstash";
import { PRICING, KIE_PRICING, WEB_SEARCH_ADDON_PRICE, USD_TO_ILS } from "@/lib/constants";
import type { LogEntry } from "@/types/log";

export const maxDuration = 60;

function getReceiver(): Receiver {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY must be set");
  }
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
}

export async function POST(request: NextRequest) {
  // Verify QStash signature
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  try {
    const receiver = getReceiver();
    await receiver.verify({
      signature,
      body,
      url: request.url,
    });
  } catch (error) {
    console.error("[process-image] QStash signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: ImageJobPayload = JSON.parse(body);
  const { batchId, imageIndex, prompt, settings } = payload;

  // Idempotency check: skip if already completed
  const currentState = await getImageState(batchId, imageIndex);
  if (currentState?.status === "completed") {
    console.log(
      `[process-image] Image ${batchId}:${imageIndex} already completed, skipping`
    );
    return NextResponse.json({ skipped: true });
  }

  const providerName = settings.provider ?? "fal";
  const provider = getProvider(providerName);
  const pricingTable = providerName === "kie" ? KIE_PRICING : PRICING;
  const startTime = Date.now();

  try {
    // Mark as processing
    await updateImageInRedis(batchId, imageIndex, { status: "processing" });

    // Generate image
    const result = await provider.generateImage({
      prompt,
      resolution: settings.resolution,
      aspectRatio: settings.aspectRatio,
      outputFormat: settings.outputFormat,
      safetyTolerance: settings.safetyTolerance,
      numImages: providerName === "kie" ? 1 : settings.numImages,
      seed: settings.seed,
      enableWebSearch: settings.enableWebSearch,
      referenceImageUrls: settings.referenceImageUrls,
    });

    const durationMs = Date.now() - startTime;

    if (!result.images || result.images.length === 0) {
      throw new Error("Provider returned no images");
    }
    const image = result.images[0];

    // Persist to Supabase Storage
    const permanentUrl = await persistFile(image.url, "images", image.contentType);
    const finalUrl = permanentUrl ?? image.url;

    // Update Redis with result
    await updateImageInRedis(batchId, imageIndex, {
      status: "completed",
      result: {
        url: finalUrl,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
      },
      seed: result.seed,
      requestId: result.requestId,
      durationMs,
    });

    // Append to logs (same as existing SSE route)
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      batchId,
      imageIndex,
      prompt,
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
      resultUrl: finalUrl,
      width: image.width,
      height: image.height,
      requestId: result.requestId,
      cost:
        ((pricingTable[settings.resolution] ?? 0.15) +
          (providerName === "fal" && settings.enableWebSearch
            ? WEB_SEARCH_ADDON_PRICE
            : 0)) *
        USD_TO_ILS,
    };
    await appendLog(logEntry);

    console.log(
      `[process-image] ${batchId}:${imageIndex} completed in ${durationMs}ms`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Update Redis with failure
    await updateImageInRedis(batchId, imageIndex, {
      status: "failed",
      error: errorMessage,
      durationMs,
    });

    // Append failure log
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      batchId,
      imageIndex,
      prompt,
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

    console.error(
      `[process-image] ${batchId}:${imageIndex} failed:`,
      errorMessage
    );

    // Return 200 so QStash doesn't retry on application-level errors
    // Only return non-200 for transient errors that should be retried
    return NextResponse.json({ success: false, error: errorMessage });
  }
}
