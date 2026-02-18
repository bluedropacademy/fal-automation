import { NextRequest, NextResponse } from "next/server";
import { KieProvider } from "@/lib/providers/kie-provider";
import { persistFile } from "@/lib/supabase-storage";

export const maxDuration = 60;

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

  const persistedResults = await Promise.all(
    results.map(async (result) => {
      if (result.state === "success" && result.videoUrl) {
        const permanentUrl = await persistFile(result.videoUrl, "videos", "video/mp4");
        return { ...result, videoUrl: permanentUrl ?? result.videoUrl };
      }
      return result;
    })
  );

  return NextResponse.json({ results: persistedResults });
}
