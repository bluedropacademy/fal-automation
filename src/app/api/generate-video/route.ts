import { NextRequest } from "next/server";
import { KieProvider } from "@/lib/providers/kie-provider";

export const maxDuration = 300;

interface VideoRequest {
  images: Array<{
    index: number;
    imageUrl: string;
    prompt: string;
  }>;
  duration: "6" | "10";
  resolution: "768P" | "1080P";
}

interface VideoEvent {
  type: "video_update" | "batch_complete" | "batch_error";
  index?: number;
  status?: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  taskId?: string;
  error?: string;
  durationMs?: number;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as VideoRequest;
  const { images, duration, resolution } = body;
  const provider = new KieProvider();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: VideoEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Process videos sequentially — video generation is expensive
      for (let i = 0; i < images.length; i++) {
        if (request.signal.aborted) break;

        const img = images[i];
        const startTime = Date.now();

        sendEvent({ type: "video_update", index: img.index, status: "queued" });

        try {
          const result = await provider.generateVideo(
            {
              prompt: img.prompt,
              imageUrl: img.imageUrl,
              duration,
              resolution,
            },
            (status) => {
              sendEvent({ type: "video_update", index: img.index, status });
            }
          );

          sendEvent({
            type: "video_update",
            index: img.index,
            status: "completed",
            videoUrl: result.videoUrl,
            taskId: result.taskId,
            durationMs: Date.now() - startTime,
          });
        } catch (error) {
          sendEvent({
            type: "video_update",
            index: img.index,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            durationMs: Date.now() - startTime,
          });
        }
      }

      sendEvent({ type: "batch_complete" });

      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
