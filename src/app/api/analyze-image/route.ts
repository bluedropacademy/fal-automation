import { NextRequest, NextResponse } from "next/server";
import { GeminiProvider } from "@/lib/providers/gemini-provider";

export const maxDuration = 60;

interface AnalyzeRequest {
  imageUrl: string;
  systemPrompt: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const { imageUrl, systemPrompt } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl" },
        { status: 400 }
      );
    }

    if (!systemPrompt) {
      return NextResponse.json(
        { error: "Missing systemPrompt" },
        { status: 400 }
      );
    }

    const provider = new GeminiProvider();
    const prompt = await provider.analyzeImage({ imageUrl, systemPrompt });

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("[analyze-image] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze image",
      },
      { status: 500 }
    );
  }
}
