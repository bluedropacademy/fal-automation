import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureDownloadDir, downloadImage } from "@/lib/file-utils";
import { padIndex, sanitizeFilename } from "@/lib/format-utils";

interface DownloadItem {
  index: number;
  url: string;
  prompt: string;
  outputFormat: string;
}

export async function POST(request: NextRequest) {
  try {
    const { batchId, images } = (await request.json()) as {
      batchId: string;
      images: DownloadItem[];
    };

    const dir = await ensureDownloadDir(batchId);
    const total = images.length;
    const results: { index: number; success: boolean; path?: string; error?: string }[] = [];

    for (const item of images) {
      const ext = item.outputFormat || "png";
      const filename = `${padIndex(item.index, total)}-${sanitizeFilename(item.prompt)}.${ext}`;
      const filePath = path.join(dir, filename);

      try {
        await downloadImage(item.url, filePath);
        results.push({ index: item.index, success: true, path: filePath });
      } catch (error) {
        results.push({
          index: item.index,
          success: false,
          error: error instanceof Error ? error.message : "Download failed",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      downloadPath: dir,
      total,
      successCount,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 }
    );
  }
}
