import { NextRequest, NextResponse } from "next/server";
import { readLogs } from "@/lib/file-utils";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const batchId = searchParams.get("batchId") ?? undefined;

    const logs = await readLogs(date, batchId);
    return NextResponse.json(logs);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read logs" },
      { status: 500 }
    );
  }
}
