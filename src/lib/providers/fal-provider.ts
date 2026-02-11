import { fal } from "@/lib/fal-server";
import { FAL_MODEL_TEXT_TO_IMAGE, FAL_MODEL_IMAGE_EDIT } from "@/lib/constants";
import type { ImageProvider, ProviderGenerateInput, ProviderGenerateResult, OnStatusUpdate } from "./types";

export class FalProvider implements ImageProvider {
  async generateImage(
    input: ProviderGenerateInput,
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult> {
    const endpoint =
      (input.referenceImageUrls?.length ?? 0) > 0
        ? FAL_MODEL_IMAGE_EDIT
        : FAL_MODEL_TEXT_TO_IMAGE;

    const falInput: Record<string, unknown> = {
      prompt: input.prompt,
      num_images: input.numImages ?? 1,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      output_format: input.outputFormat,
      safety_tolerance: String(input.safetyTolerance ?? 4),
      enable_web_search: input.enableWebSearch ?? false,
    };

    if (input.seed !== undefined) {
      falInput.seed = input.seed;
    }

    if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
      falInput.image_urls = input.referenceImageUrls;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal as any).subscribe(endpoint, {
      input: falInput,
      onQueueUpdate: (update: { status: string }) => {
        if (update.status === "IN_PROGRESS" && onStatusUpdate) {
          onStatusUpdate("processing");
        }
      },
    });

    const data = result.data as {
      images: Array<{ url: string; content_type: string; width: number; height: number }>;
      seed?: number;
    };

    return {
      images: data.images.map((img) => ({
        url: img.url,
        contentType: img.content_type,
        width: img.width,
        height: img.height,
      })),
      seed: data.seed,
      requestId: result.requestId,
    };
  }

  async editImage(
    input: ProviderGenerateInput & { imageUrls: string[] },
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult> {
    return this.generateImage(
      { ...input, referenceImageUrls: input.imageUrls },
      onStatusUpdate
    );
  }
}
