import { NextRequest, NextResponse } from "next/server";
import { KieProvider } from "@/lib/providers/kie-provider";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const taskIdsParam = request.nextUrl.searchParams.get("taskIds");
  if (!taskIdsParam) {
    return NextResponse.json({ error: "taskIds parameter required" }, { status: 400 });
  }

  const taskIds = taskIdsParam.split(",").filter(Boolean);
  if (taskIds.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const provider = new KieProvider();

  const results = await Promise.all(
    taskIds.map((taskId) => provider.pollVideoTask(taskId))
  );

  return NextResponse.json({ results });
}
