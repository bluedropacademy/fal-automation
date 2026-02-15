import { KIE_MODEL_TEXT_TO_IMAGE, KIE_MODEL_IMAGE_EDIT, KIE_MODEL_IMAGE_TO_VIDEO, KIE_POLL_INTERVAL_MS, KIE_MAX_POLL_ATTEMPTS } from "@/lib/constants";
import type { ImageProvider, ProviderGenerateInput, ProviderGenerateResult, OnStatusUpdate, VideoGenerateInput, VideoGenerateResult } from "./types";

const KIE_API_BASE = "https://api.kie.ai/api/v1/jobs";

function getKieKey(): string {
  const key = process.env.KIE_KEY;
  if (!key) throw new Error("KIE_KEY environment variable not configured");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapOutputFormat(format: string): string {
  if (format === "webp") return "png";
  if (format === "jpeg") return "jpg";
  return format;
}

export class KieProvider implements ImageProvider {
  async generateImage(
    input: ProviderGenerateInput,
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult> {
    const kieInput: Record<string, unknown> = {
      prompt: input.prompt,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      output_format: mapOutputFormat(input.outputFormat),
    };

    return this.createAndPoll(KIE_MODEL_TEXT_TO_IMAGE, kieInput, onStatusUpdate);
  }

  async editImage(
    input: ProviderGenerateInput & { imageUrls: string[] },
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult> {
    const kieInput: Record<string, unknown> = {
      prompt: input.prompt,
      image_urls: input.imageUrls,
      output_format: mapOutputFormat(input.outputFormat),
    };

    return this.createAndPoll(KIE_MODEL_IMAGE_EDIT, kieInput, onStatusUpdate);
  }

  async generateVideo(
    input: VideoGenerateInput,
    onStatusUpdate?: OnStatusUpdate
  ): Promise<VideoGenerateResult> {
    const kieInput: Record<string, unknown> = {
      prompt: input.prompt,
      image_url: input.imageUrl,
      duration: input.duration,
      resolution: input.resolution,
    };

    const createRes = await fetch(`${KIE_API_BASE}/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getKieKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: KIE_MODEL_IMAGE_TO_VIDEO, input: kieInput }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Kie AI video createTask failed (${createRes.status}): ${errText}`);
    }

    const createData = await createRes.json();
    if (createData.code !== 200) {
      throw new Error(`Kie AI video createTask error: ${createData.msg}`);
    }

    const taskId = createData.data.taskId as string;
    console.log(`[Kie] Video task created: ${taskId}`);
    onStatusUpdate?.("queued");

    let consecutiveErrors = 0;

    for (let attempt = 0; attempt < KIE_MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(KIE_POLL_INTERVAL_MS);

      let pollRes: Response;
      try {
        pollRes = await fetch(
          `${KIE_API_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`,
          { headers: { Authorization: `Bearer ${getKieKey()}` } }
        );
      } catch (fetchErr) {
        consecutiveErrors++;
        console.warn(`[Kie] Video poll error for ${taskId}:`, fetchErr);
        if (consecutiveErrors >= 5) {
          throw new Error(`Kie AI video polling failed: 5 consecutive network errors`);
        }
        continue;
      }

      if (!pollRes.ok) {
        consecutiveErrors++;
        console.warn(`[Kie] Video poll HTTP ${pollRes.status} for ${taskId}`);
        if (consecutiveErrors >= 5) {
          throw new Error(`Kie AI video polling failed: 5 consecutive HTTP errors`);
        }
        continue;
      }

      consecutiveErrors = 0;
      const pollData = await pollRes.json();
      const state = pollData.data?.state as string | undefined;

      if (state === "generating") {
        onStatusUpdate?.("processing");
      } else if (state === "success") {
        let resultData: Record<string, unknown>;
        const raw = pollData.data.resultJson;
        if (typeof raw === "string") {
          try {
            resultData = JSON.parse(raw);
          } catch {
            throw new Error(`Kie AI video returned invalid resultJson`);
          }
        } else if (raw && typeof raw === "object") {
          resultData = raw as Record<string, unknown>;
        } else {
          throw new Error(`Kie AI video returned unexpected resultJson type: ${typeof raw}`);
        }

        const videoUrl =
          (resultData.video_url as string) ??
          (resultData.videoUrl as string) ??
          (resultData.url as string) ??
          (resultData.resultUrls as string[])?.[0] ??
          (resultData.result_urls as string[])?.[0] ??
          null;

        if (!videoUrl) {
          console.error(`[Kie] Video no URL in resultJson:`, JSON.stringify(resultData));
          throw new Error(`Kie AI video success but no URL. Keys: ${Object.keys(resultData).join(", ")}`);
        }

        console.log(`[Kie] Video task ${taskId} completed`);
        return { videoUrl, taskId };
      } else if (state === "fail") {
        throw new Error(
          `Kie AI video failed: ${pollData.data.failMsg ?? "Unknown error"} (code: ${pollData.data.failCode})`
        );
      }
    }

    throw new Error(
      `Kie AI video timed out after ${(KIE_MAX_POLL_ATTEMPTS * KIE_POLL_INTERVAL_MS) / 1000}s`
    );
  }

  private async createAndPoll(
    model: string,
    input: Record<string, unknown>,
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult> {
    const createRes = await fetch(`${KIE_API_BASE}/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getKieKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Kie AI createTask failed (${createRes.status}): ${errText}`);
    }

    const createData = await createRes.json();
    if (createData.code !== 200) {
      throw new Error(`Kie AI createTask error: ${createData.msg}`);
    }

    const taskId = createData.data.taskId as string;
    console.log(`[Kie] Task created: ${taskId} for model ${model}`);
    onStatusUpdate?.("queued");

    let consecutiveErrors = 0;

    for (let attempt = 0; attempt < KIE_MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(KIE_POLL_INTERVAL_MS);

      let pollRes: Response;
      try {
        pollRes = await fetch(
          `${KIE_API_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`,
          {
            headers: {
              Authorization: `Bearer ${getKieKey()}`,
            },
          }
        );
      } catch (fetchErr) {
        consecutiveErrors++;
        console.warn(`[Kie] Poll fetch error for ${taskId} (attempt ${attempt}):`, fetchErr);
        if (consecutiveErrors >= 5) {
          throw new Error(`Kie AI polling failed: 5 consecutive network errors for task ${taskId}`);
        }
        continue;
      }

      if (!pollRes.ok) {
        consecutiveErrors++;
        console.warn(`[Kie] Poll HTTP ${pollRes.status} for ${taskId} (attempt ${attempt})`);
        if (consecutiveErrors >= 5) {
          throw new Error(`Kie AI polling failed: 5 consecutive HTTP errors (last: ${pollRes.status})`);
        }
        continue;
      }

      consecutiveErrors = 0;
      const pollData = await pollRes.json();
      const state = pollData.data?.state as string | undefined;

      if (state === "generating") {
        onStatusUpdate?.("processing");
      } else if (state === "success") {
        // resultJson can be either a JSON string or an already-parsed object
        let resultData: Record<string, unknown>;
        const raw = pollData.data.resultJson;
        if (typeof raw === "string") {
          try {
            resultData = JSON.parse(raw);
          } catch {
            console.error(`[Kie] Failed to parse resultJson string for ${taskId}:`, raw);
            throw new Error(`Kie AI returned invalid resultJson for task ${taskId}`);
          }
        } else if (raw && typeof raw === "object") {
          resultData = raw as Record<string, unknown>;
        } else {
          console.error(`[Kie] Unexpected resultJson type for ${taskId}:`, typeof raw, raw);
          throw new Error(`Kie AI returned unexpected resultJson type: ${typeof raw}`);
        }

        // Try multiple possible field names for the result URLs
        const urls: string[] =
          (resultData.resultUrls as string[]) ??
          (resultData.result_urls as string[]) ??
          (resultData.urls as string[]) ??
          (resultData.images as string[]) ??
          [];

        // If resultData has an image/url field directly (single result)
        if (urls.length === 0 && typeof resultData.url === "string") {
          urls.push(resultData.url as string);
        }

        if (urls.length === 0) {
          console.error(`[Kie] No result URLs found in resultJson for ${taskId}:`, JSON.stringify(resultData));
          throw new Error(`Kie AI returned success but no result URLs. Keys: ${Object.keys(resultData).join(", ")}`);
        }

        console.log(`[Kie] Task ${taskId} completed with ${urls.length} image(s)`);

        return {
          images: urls.map((url) => ({
            url,
            contentType: "image/png",
            width: 0,
            height: 0,
          })),
          requestId: taskId,
        };
      } else if (state === "fail") {
        throw new Error(
          `Kie AI task failed: ${pollData.data.failMsg ?? "Unknown error"} (code: ${pollData.data.failCode})`
        );
      }
      // "waiting" or "queuing" — keep polling
    }

    throw new Error(
      `Kie AI task timed out after ${(KIE_MAX_POLL_ATTEMPTS * KIE_POLL_INTERVAL_MS) / 1000}s`
    );
  }
}
