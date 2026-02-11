import type { ImageStatus } from "./batch";

export interface GenerationSettings {
  resolution: "1K" | "2K" | "4K";
  aspectRatio: string;
  outputFormat: "png" | "jpeg" | "webp";
  safetyTolerance: number;
  numImages: number;
  seed?: number;
  enableWebSearch: boolean;
  promptPrefix: string;
  promptSuffix: string;
  referenceImageUrls: string[];
  concurrency: number;
}

export interface GenerationRequest {
  batchId: string;
  prompts: string[];
  settings: GenerationSettings;
}

export interface GenerationEvent {
  type: "image_update" | "batch_complete" | "batch_error";
  index?: number;
  status?: ImageStatus;
  image?: {
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
