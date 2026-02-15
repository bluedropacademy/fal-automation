import type { GenerationSettings, Provider } from "@/types";

export const ASPECT_RATIOS = [
  "auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16",
] as const;

export const RESOLUTIONS = ["1K", "2K", "4K"] as const;

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

// Fal AI pricing (USD per image)
export const PRICING: Record<string, number> = {
  "1K": 0.15,
  "2K": 0.15,
  "4K": 0.30,
};

// Kie AI pricing (USD per image)
export const KIE_PRICING: Record<string, number> = {
  "1K": 0.09,
  "2K": 0.09,
  "4K": 0.12,
};

export const WEB_SEARCH_ADDON_PRICE = 0.015;

export const USD_TO_ILS = 3.6;

// Fal AI models
export const FAL_MODEL_TEXT_TO_IMAGE = "fal-ai/nano-banana-pro";
export const FAL_MODEL_IMAGE_EDIT = "fal-ai/nano-banana-pro/edit";

// Kie AI models
export const KIE_MODEL_TEXT_TO_IMAGE = "nano-banana-pro";
export const KIE_MODEL_IMAGE_EDIT = "google/nano-banana-edit";
export const KIE_MODEL_IMAGE_TO_VIDEO = "hailuo/2-3-image-to-video-pro";

// Kie AI polling config
export const KIE_POLL_INTERVAL_MS = 2000;
export const KIE_MAX_POLL_ATTEMPTS = 150;

export const MAX_CONCURRENCY = 4;

export const DEFAULT_SETTINGS: GenerationSettings = {
  provider: "fal",
  resolution: "1K",
  aspectRatio: "1:1",
  outputFormat: "png",
  safetyTolerance: 4,
  numImages: 1,
  enableWebSearch: false,
  promptPrefix: "",
  promptSuffix: "",
  referenceImageUrls: [],
  concurrency: 2,
};

export function estimateCost(
  promptCount: number,
  numImagesPerPrompt: number,
  resolution: string,
  enableWebSearch: boolean,
  provider: Provider = "fal"
): number {
  const pricingTable = provider === "kie" ? KIE_PRICING : PRICING;
  const perImage = (pricingTable[resolution] ?? 0.15) + (provider === "fal" && enableWebSearch ? WEB_SEARCH_ADDON_PRICE : 0);
  return promptCount * numImagesPerPrompt * perImage * USD_TO_ILS;
}

// Video generation config
export const VIDEO_DURATIONS = ["6", "10"] as const;
export const VIDEO_RESOLUTIONS = ["768P", "1080P"] as const;

export function isVideoConfigValid(duration: string, resolution: string): boolean {
  return !(duration === "10" && resolution === "1080P");
}

export function estimateVideoCost(
  count: number,
  duration: string,
  resolution: string
): number {
  // Approximate pricing per video (USD)
  let perVideo = 0.50;
  if (resolution === "1080P") perVideo = 0.80;
  else if (duration === "10") perVideo = 0.80;
  return count * perVideo * USD_TO_ILS;
}

export function parsePrompts(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
