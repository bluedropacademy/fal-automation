import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { Readable, PassThrough } from "stream";
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
    const { batchName, images } = (await request.json()) as {
      batchId: string;
      batchName?: string;
      images: DownloadItem[];
    };

    const archive = archiver("zip", { zlib: { level: 5 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    const total = images.length;
    const fetches = images.map(async (item) => {
      const ext = item.outputFormat || "png";
      const versionSuffix = item.versionLabel ? `-${item.versionLabel}` : "";
      const filename = `${padIndex(item.index, total)}-${sanitizeFilename(item.prompt)}${versionSuffix}.${ext}`;

      try {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        archive.append(buffer, { name: filename });
      } catch {
        // skip failed images
      }
    });

    await Promise.all(fetches);
    archive.finalize();

    const zipName = batchName?.trim()
      ? sanitizeFilename(batchName) || "images"
      : "images";

    const webStream = Readable.toWeb(passthrough) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}.zip"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 }
    );
  }
}
