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
export const KIE_MODEL_IMAGE_TO_VIDEO_PRO = "hailuo/2-3-image-to-video-pro";
export const KIE_MODEL_IMAGE_TO_VIDEO_STANDARD = "hailuo/2-3-image-to-video-standard";

// Kie AI polling config
export const KIE_POLL_INTERVAL_MS = 2000;
export const KIE_MAX_POLL_ATTEMPTS = 150;

export const MAX_CONCURRENCY = 4;

// Client-side video polling config
export const VIDEO_POLL_INTERVAL_MS = 4000;
export const VIDEO_POLL_MAX_DURATION_MS = 600000;

// Gemini Vision config
export const GEMINI_MODEL = "gemini-2.0-flash";

export const DEFAULT_GEMINI_SYSTEM_PROMPT = `You are an expert at analyzing images and generating detailed video motion prompts. Given an image, describe a compelling 6-10 second video scene that brings this image to life. Focus on:
- Camera movement (pan, zoom, dolly, orbit)
- Subject motion and animation
- Atmospheric effects (lighting changes, particles, wind)
- Emotional tone and cinematic style

Output ONLY the English video prompt, no explanations or formatting. Keep it concise (2-4 sentences).`;

export const GEMINI_PROMPT_PRESETS: Array<{ name: string; label: string; prompt: string }> = [
  {
    name: "cinematic",
    label: "קולנועי",
    prompt: `Analyze the image and create a cinematic video prompt in English. Focus on dramatic camera movements (slow dolly, crane shots, sweeping orbits), epic lighting transitions, lens flares, and depth of field shifts. The scene should feel like a movie trailer — grand, emotional, and visually stunning. Output ONLY the video prompt, 2-4 sentences.`,
  },
  {
    name: "gentle",
    label: "עדין",
    prompt: `Analyze the image and create a gentle, calming video prompt in English. Focus on very subtle, slow movements — a soft breeze, gentle floating particles, slow fade lighting. Camera should barely drift. The mood should be serene, peaceful, and meditative. Output ONLY the video prompt, 2-4 sentences.`,
  },
  {
    name: "dynamic",
    label: "דינמי",
    prompt: `Analyze the image and create an energetic, dynamic video prompt in English. Focus on fast camera moves (whip pans, quick zooms, tracking shots), dramatic motion blur, explosive particle effects, and high-energy transitions. The scene should feel intense and action-packed. Output ONLY the video prompt, 2-4 sentences.`,
  },
  {
    name: "realistic",
    label: "ריאליסטי",
    prompt: `Analyze the image and create a realistic, natural video prompt in English. Focus on subtle real-world motion — wind in hair/leaves, natural breathing, realistic physics. Minimal camera movement, as if shot on a tripod or handheld with stabilization. The scene should feel like a real captured moment. Output ONLY the video prompt, 2-4 sentences.`,
  },
];

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
  geminiSystemPrompt: DEFAULT_GEMINI_SYSTEM_PROMPT,
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
export const MAX_ACTIVE_VIDEO_TASKS = 2;
export const VIDEO_DURATIONS = ["6", "10"] as const;
export const VIDEO_RESOLUTIONS = ["768P", "1080P"] as const;

export function isVideoConfigValid(duration: string, resolution: string): boolean {
  return !(duration === "10" && resolution === "1080P");
}

// Kie AI video pricing (USD per video)
// Source: https://kie.ai/hailuo-2-3
export type VideoModel = "pro" | "standard";

export const VIDEO_PRICING_PRO: Record<string, number> = {
  "6_768P":  0.22,   // 45 credits
  "10_768P": 0.45,   // 90 credits
  "6_1080P": 0.39,   // 80 credits
};

export const VIDEO_PRICING_STANDARD: Record<string, number> = {
  "6_768P":  0.15,   // 30 credits
  "10_768P": 0.26,   // 50 credits
  "6_1080P": 0.26,   // 50 credits
};

export function getVideoModelId(model: VideoModel): string {
  return model === "pro" ? KIE_MODEL_IMAGE_TO_VIDEO_PRO : KIE_MODEL_IMAGE_TO_VIDEO_STANDARD;
}

export function estimateVideoCost(
  count: number,
  duration: string,
  resolution: string,
  model: VideoModel = "pro"
): number {
  const key = `${duration}_${resolution}`;
  const pricingTable = model === "pro" ? VIDEO_PRICING_PRO : VIDEO_PRICING_STANDARD;
  const perVideo = pricingTable[key] ?? 0.39;
  return count * perVideo * USD_TO_ILS;
}

export function parsePrompts(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
