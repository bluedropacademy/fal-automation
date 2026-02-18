import { NextRequest, NextResponse } from "next/server";
import { getBatchProgress } from "@/lib/qstash";

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batchId");

  if (!batchId) {
    return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
  }

  try {
    const progress = await getBatchProgress(batchId);

    if (!progress) {
      return NextResponse.json(
        { error: "Batch not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(progress);
  } catch (error) {
    console.error("[batch/progress] Error:", error);
    return NextResponse.json(
      { error: "Failed to get batch progress" },
      { status: 500 }
    );
  }
}
