export type ImageStatus = "pending" | "queued" | "processing" | "completed" | "failed" | "editing";

export type BatchStatus = "idle" | "running" | "completed" | "cancelled" | "error" | "interrupted";

export type EditMode = "replace" | "duplicate" | "parallel";

export interface ImageVersion {
  versionNumber: number;
  url: string;
  contentType: string;
  width: number;
  height: number;
  editPrompt: string;
  createdAt: string;
}

export interface BatchImage {
  /** Unique identifier for this image within the batch */
  id: string;
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
  /** Version history (V1 = original). Only present if the image has been edited. */
  versions?: ImageVersion[];
  /** Which version is currently displayed. undefined = latest */
  currentVersion?: number;
  /** If this image was created via duplicate/parallel edit, references the source image index */
  sourceImageIndex?: number;
  /** Edit label for images created from edits (e.g. "V2", "V3") */
  versionLabel?: string;
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
