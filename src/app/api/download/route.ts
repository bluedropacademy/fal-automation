import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureDownloadDir, downloadImage } from "@/lib/file-utils";
import { padIndex, sanitizeFilename } from "@/lib/format-utils";

interface DownloadItem {
  index: number;
  url: string;
  prompt: string;
  outputFormat: string;
  versionLabel?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { batchId, batchName, images } = (await request.json()) as {
      batchId: string;
      batchName?: string;
      images: DownloadItem[];
    };

    const dir = await ensureDownloadDir(batchId, batchName);
    const total = images.length;
    const results: { index: number; success: boolean; path?: string; error?: string }[] = [];

    for (const item of images) {
      const ext = item.outputFormat || "png";
      const versionSuffix = item.versionLabel ? `-${item.versionLabel}` : "";
      const filename = `${padIndex(item.index, total)}-${sanitizeFilename(item.prompt)}${versionSuffix}.${ext}`;
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
