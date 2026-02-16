import { NextRequest, NextResponse } from "next/server";
import { KieProvider } from "@/lib/providers/kie-provider";

export const maxDuration = 30;

interface CreateTaskRequest {
  index: number;
  imageUrl: string;
  prompt: string;
  duration: "6" | "10";
  resolution: "768P" | "1080P";
  model?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreateTaskRequest;
  const { index, imageUrl, prompt, duration, resolution, model } = body;
  const provider = new KieProvider();

  try {
    const { taskId } = await provider.createVideoTask({
      prompt,
      imageUrl,
      duration,
      resolution,
      model,
    });
    return NextResponse.json({ index, taskId });
  } catch (error) {
    return NextResponse.json(
      { index, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
