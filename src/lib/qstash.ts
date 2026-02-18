import { Client } from "@upstash/qstash";
import type { GenerationSettings } from "@/types/generation";
import type { BatchMeta, BatchImageState, BatchProgress, ImageJobPayload } from "@/types/qstash";

// Re-export types for convenience
export type { BatchMeta, BatchImageState, BatchProgress, ImageJobPayload };

// --- QStash Client ---

let qstashClient: Client | null = null;

function getQStash(): Client {
  if (qstashClient) return qstashClient;
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN not configured");
  qstashClient = new Client({ token });
  return qstashClient;
}

export function isQStashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

// --- Redis helpers (reuse existing Upstash Redis from file-utils pattern) ---

let redis: import("@upstash/redis").Redis | null = null;

async function getRedis() {
  if (redis) return redis;
  const { Redis } = await import("@upstash/redis");
  redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  return redis;
}

// --- Redis keys ---

const BATCH_TTL = 86400; // 24 hours

function metaKey(batchId: string) {
  return `batch:${batchId}:meta`;
}

function imgKey(batchId: string, index: number) {
  return `batch:${batchId}:img:${index}`;
}

// --- Batch CRUD ---

export async function createBatchInRedis(meta: BatchMeta): Promise<void> {
  const kv = await getRedis();
  const pipeline = kv.pipeline();

  // Save metadata
  pipeline.set(metaKey(meta.batchId), JSON.stringify(meta), { ex: BATCH_TTL });

  // Initialize all images as pending
  for (let i = 0; i < meta.totalImages; i++) {
    const state: BatchImageState = { status: "pending" };
    pipeline.set(imgKey(meta.batchId, i), JSON.stringify(state), { ex: BATCH_TTL });
  }

  await pipeline.exec();
}

export async function updateImageInRedis(
  batchId: string,
  index: number,
  update: Partial<BatchImageState>
): Promise<void> {
  const kv = await getRedis();
  const key = imgKey(batchId, index);
  const raw = await kv.get<string>(key);
  const current: BatchImageState = raw ? JSON.parse(raw) : { status: "pending" };
  const merged = { ...current, ...update };
  await kv.set(key, JSON.stringify(merged), { ex: BATCH_TTL });
}

export async function getImageState(
  batchId: string,
  index: number
): Promise<BatchImageState | null> {
  const kv = await getRedis();
  const raw = await kv.get<string>(imgKey(batchId, index));
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function getBatchProgress(batchId: string): Promise<BatchProgress | null> {
  const kv = await getRedis();

  // Get metadata
  const rawMeta = await kv.get<string>(metaKey(batchId));
  if (!rawMeta) return null;
  const meta: BatchMeta = JSON.parse(rawMeta);

  // Get all image states in a pipeline
  const pipeline = kv.pipeline();
  for (let i = 0; i < meta.totalImages; i++) {
    pipeline.get(imgKey(batchId, i));
  }
  const results = await pipeline.exec();

  const images: Record<string, BatchImageState> = {};
  let completedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < meta.totalImages; i++) {
    const raw = results[i];
    if (raw instanceof Error || raw === undefined) {
      images[String(i)] = { status: "pending" };
      continue;
    }
    const state: BatchImageState = raw ? JSON.parse(raw as string) : { status: "pending" };
    images[String(i)] = state;
    if (state.status === "completed") completedCount++;
    if (state.status === "failed") failedCount++;
  }

  const allDone = completedCount + failedCount >= meta.totalImages;

  return {
    batchId,
    status: allDone ? "completed" : "running",
    totalImages: meta.totalImages,
    completedCount,
    failedCount,
    images,
  };
}

// --- QStash Job Publishing ---

export async function publishImageJobs(
  batchId: string,
  prompts: string[],
  settings: GenerationSettings
): Promise<void> {
  const qstash = getQStash();

  // Determine the base URL for webhooks
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const destination = `${baseUrl}/api/batch/process-image`;

  // Publish one message per image
  const publishes = prompts.map((prompt, index) => {
    const fullPrompt = [settings.promptPrefix, prompt, settings.promptSuffix]
      .filter(Boolean)
      .join(" ")
      .trim();

    const payload: ImageJobPayload = {
      batchId,
      imageIndex: index,
      prompt: fullPrompt,
      settings,
    };

    return qstash.publishJSON({
      url: destination,
      body: payload,
      retries: 3,
    });
  });

  await Promise.all(publishes);
}
