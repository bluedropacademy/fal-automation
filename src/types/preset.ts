import type { GenerationSettings } from "./generation";

export interface Preset {
  name: string;
  description?: string;
  settings: GenerationSettings;
  createdAt: string;
  updatedAt: string;
}
