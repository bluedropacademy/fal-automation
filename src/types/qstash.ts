import type { GenerationSettings } from "./generation";

export interface BatchMeta {
  batchId: string;
  batchName: string;
  totalImages: number;
  settings: GenerationSettings;
  prompts: string[];
  createdAt: string;
}

export interface BatchImageState {
  status: "pending" | "queued" | "processing" | "completed" | "failed";
  result?: {
    url: string;
    contentType: string;
    width: number;
    height: number;
  };
  seed?: number;
  requestId?: string;
  error?: string;
  durationMs?: number;
}

export interface BatchProgress {
  batchId: string;
  status: "running" | "completed";
  totalImages: number;
  completedCount: number;
  failedCount: number;
  images: Record<string, BatchImageState>;
}

export interface ImageJobPayload {
  batchId: string;
  imageIndex: number;
  prompt: string;
  settings: GenerationSettings;
}
