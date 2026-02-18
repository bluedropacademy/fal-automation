import { NextRequest, NextResponse } from "next/server";
import {
  isQStashEnabled,
  createBatchInRedis,
  publishImageJobs,
  type BatchMeta,
} from "@/lib/qstash";
import type { GenerationSettings } from "@/types/generation";

interface StartBatchRequest {
  batchId: string;
  batchName: string;
  prompts: string[];
  settings: GenerationSettings;
}

export async function POST(request: NextRequest) {
  if (!isQStashEnabled()) {
    return NextResponse.json(
      { error: "QStash not configured" },
      { status: 501 }
    );
  }

  try {
    const body = (await request.json()) as StartBatchRequest;
    const { batchId, batchName, prompts, settings } = body;

    if (!batchId || !prompts?.length || !settings) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create batch metadata in Redis
    const meta: BatchMeta = {
      batchId,
      batchName,
      totalImages: prompts.length,
      settings,
      prompts,
      createdAt: new Date().toISOString(),
    };

    await createBatchInRedis(meta);

    // Publish one QStash message per image
    await publishImageJobs(batchId, prompts, settings);

    console.log(
      `[batch/start] Created batch ${batchId} with ${prompts.length} images via QStash`
    );

    return NextResponse.json({
      batchId,
      totalImages: prompts.length,
    });
  } catch (error) {
    console.error("[batch/start] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
