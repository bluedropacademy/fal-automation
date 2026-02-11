import type { GenerationSettings } from "@/types";

export const ASPECT_RATIOS = [
  "auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16",
] as const;

export const RESOLUTIONS = ["1K", "2K", "4K"] as const;

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

export const PRICING: Record<string, number> = {
  "1K": 0.15,
  "2K": 0.15,
  "4K": 0.30,
};

export const WEB_SEARCH_ADDON_PRICE = 0.015;

export const FAL_MODEL_TEXT_TO_IMAGE = "fal-ai/nano-banana-pro";
export const FAL_MODEL_IMAGE_EDIT = "fal-ai/nano-banana-pro/edit";

export const DEFAULT_SETTINGS: GenerationSettings = {
  resolution: "1K",
  aspectRatio: "1:1",
  outputFormat: "png",
  safetyTolerance: 4,
  numImages: 1,
  enableWebSearch: false,
  promptPrefix: "",
  promptSuffix: "",
  referenceImageUrls: [],
};

export function estimateCost(
  promptCount: number,
  numImagesPerPrompt: number,
  resolution: string,
  enableWebSearch: boolean
): number {
  const perImage = (PRICING[resolution] ?? 0.15) + (enableWebSearch ? WEB_SEARCH_ADDON_PRICE : 0);
  return promptCount * numImagesPerPrompt * perImage;
}

export function parsePrompts(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
