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
