import { NextRequest, NextResponse } from "next/server";
import { readLogs } from "@/lib/file-utils";

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batchId");
  const date = request.nextUrl.searchParams.get("date");

  if (!batchId) {
    return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
  }

  try {
    const logs = await readLogs(date ?? undefined, batchId);

    return NextResponse.json({
      batchId,
      completedIndices: logs
        .filter((l) => l.status === "completed")
        .map((l) => ({
          index: l.imageIndex,
          url: l.resultUrl,
          width: l.width,
          height: l.height,
        })),
      failedIndices: logs
        .filter((l) => l.status === "failed")
        .map((l) => l.imageIndex),
      totalLogged: logs.length,
    });
  } catch {
    return NextResponse.json({ completedIndices: [], failedIndices: [], totalLogged: 0 });
  }
}
