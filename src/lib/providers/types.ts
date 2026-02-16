export interface ProviderGenerateInput {
  prompt: string;
  resolution: string;
  aspectRatio: string;
  outputFormat: string;
  safetyTolerance?: number;
  numImages?: number;
  seed?: number;
  enableWebSearch?: boolean;
  referenceImageUrls?: string[];
}

export interface ProviderGenerateResult {
  images: Array<{
    url: string;
    contentType: string;
    width: number;
    height: number;
  }>;
  seed?: number;
  requestId?: string;
}

export type OnStatusUpdate = (status: "queued" | "processing") => void;

export interface ImageProvider {
  generateImage(
    input: ProviderGenerateInput,
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult>;

  editImage(
    input: ProviderGenerateInput & { imageUrls: string[] },
    onStatusUpdate?: OnStatusUpdate
  ): Promise<ProviderGenerateResult>;
}

// --- Video generation types (Kie AI only) ---

export interface VideoGenerateInput {
  prompt: string;
  imageUrl: string;
  duration: "6" | "10";
  resolution: "768P" | "1080P";
  model?: string;
}

export interface VideoGenerateResult {
  videoUrl: string;
  taskId: string;
}

export interface VideoTaskStatus {
  taskId: string;
  state: "waiting" | "queuing" | "generating" | "success" | "fail" | "error";
  videoUrl?: string;
  error?: string;
}
