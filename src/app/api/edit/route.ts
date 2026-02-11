import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import type { Provider } from "@/types/generation";

export const maxDuration = 300;

interface EditRequestBody {
  imageUrl: string;
  prompt: string;
  provider?: string;
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
  provider?: string;
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
  const providerName = (body.provider as Provider) ?? "fal";
  const provider = getProvider(providerName);

  const result = await provider.editImage({
    prompt,
    imageUrls: [imageUrl],
    resolution: settings.resolution,
    aspectRatio: settings.aspectRatio,
    outputFormat: settings.outputFormat,
    safetyTolerance: settings.safetyTolerance,
    enableWebSearch: settings.enableWebSearch,
    seed: settings.seed,
  });

  const image = result.images[0];

  return NextResponse.json({
    image: {
      url: image.url,
      contentType: image.contentType,
      width: image.width,
      height: image.height,
    },
    seed: result.seed,
    requestId: result.requestId,
  });
}

async function handleParallelEdit(body: ParallelEditRequestBody) {
  const { imageUrl, variations, settings } = body;
  const providerName = (body.provider as Provider) ?? "fal";
  const provider = getProvider(providerName);

  const results = await Promise.allSettled(
    variations.map(async (variation) => {
      const result = await provider.editImage({
        prompt: variation.prompt,
        imageUrls: [imageUrl],
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        outputFormat: settings.outputFormat,
        safetyTolerance: settings.safetyTolerance,
        enableWebSearch: settings.enableWebSearch,
        seed: settings.seed,
      });

      const image = result.images[0];

      return {
        label: variation.label,
        prompt: variation.prompt,
        image: {
          url: image.url,
          contentType: image.contentType,
          width: image.width,
          height: image.height,
        },
        seed: result.seed,
        requestId: result.requestId,
      };
    })
  );

  const successResults: Array<{
    label: string;
    prompt: string;
    image: { url: string; contentType: string; width: number; height: number };
    seed?: number;
    requestId?: string;
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
