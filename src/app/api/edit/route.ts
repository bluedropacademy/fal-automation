import { NextRequest, NextResponse } from "next/server";
import { fal } from "@/lib/fal-server";
import { FAL_MODEL_IMAGE_EDIT } from "@/lib/constants";

export const maxDuration = 300;

interface EditRequestBody {
  imageUrl: string;
  prompt: string;
  settings: {
    resolution: string;
    aspectRatio: string;
    outputFormat: string;
    safetyTolerance: number;
    enableWebSearch: boolean;
    seed?: number;
  };
}

interface EditVariation {
  prompt: string;
  label: string;
}

interface ParallelEditRequestBody {
  imageUrl: string;
  variations: EditVariation[];
  settings: EditRequestBody["settings"];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Parallel mode: multiple variations
    if (body.variations) {
      return handleParallelEdit(body as ParallelEditRequestBody);
    }

    // Single edit
    return handleSingleEdit(body as EditRequestBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Edit failed" },
      { status: 500 }
    );
  }
}

async function handleSingleEdit(body: EditRequestBody) {
  const { imageUrl, prompt, settings } = body;

  const input: Record<string, unknown> = {
    prompt,
    image_urls: [imageUrl],
    num_images: 1,
    resolution: settings.resolution,
    aspect_ratio: settings.aspectRatio,
    output_format: settings.outputFormat,
    safety_tolerance: String(settings.safetyTolerance),
    enable_web_search: settings.enableWebSearch,
  };

  if (settings.seed !== undefined) {
    input.seed = settings.seed;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal as any).subscribe(FAL_MODEL_IMAGE_EDIT, { input });

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

  return NextResponse.json({
    image: {
      url: image.url,
      contentType: image.content_type,
      width: image.width,
      height: image.height,
    },
    seed: data.seed,
    requestId: result.requestId,
  });
}

async function handleParallelEdit(body: ParallelEditRequestBody) {
  const { imageUrl, variations, settings } = body;

  const results = await Promise.allSettled(
    variations.map(async (variation) => {
      const input: Record<string, unknown> = {
        prompt: variation.prompt,
        image_urls: [imageUrl],
        num_images: 1,
        resolution: settings.resolution,
        aspect_ratio: settings.aspectRatio,
        output_format: settings.outputFormat,
        safety_tolerance: String(settings.safetyTolerance),
        enable_web_search: settings.enableWebSearch,
      };

      if (settings.seed !== undefined) {
        input.seed = settings.seed;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal as any).subscribe(FAL_MODEL_IMAGE_EDIT, { input });

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

      return {
        label: variation.label,
        prompt: variation.prompt,
        image: {
          url: image.url,
          contentType: image.content_type,
          width: image.width,
          height: image.height,
        },
        seed: data.seed,
        requestId: result.requestId,
      };
    })
  );

  const successResults: Array<{
    label: string;
    prompt: string;
    image: { url: string; contentType: string; width: number; height: number };
    seed?: number;
    requestId: string;
  }> = [];

  const failedResults: Array<{ label: string; error: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      successResults.push(r.value);
    } else {
      failedResults.push({
        label: variations[i]?.label ?? `Variation ${i + 1}`,
        error: r.reason instanceof Error ? r.reason.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    results: successResults,
    errors: failedResults,
  });
}
