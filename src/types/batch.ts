export type ImageStatus = "pending" | "queued" | "processing" | "completed" | "failed";

export type BatchStatus = "idle" | "running" | "completed" | "cancelled" | "error";

export interface BatchImage {
  index: number;
  rawPrompt: string;
  fullPrompt: string;
  status: ImageStatus;
  result?: {
    url: string;
    contentType: string;
    width: number;
    height: number;
  };
  requestId?: string;
  seed?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface Batch {
  id: string;
  name: string;
  status: BatchStatus;
  images: BatchImage[];
  settings: import("./generation").GenerationSettings;
  createdAt: string;
  completedAt?: string;
  estimatedCost: number;
}
