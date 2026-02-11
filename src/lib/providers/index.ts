import type { ImageProvider } from "./types";
import type { Provider } from "@/types/generation";
import { FalProvider } from "./fal-provider";
import { KieProvider } from "./kie-provider";

const providerInstances: Record<Provider, ImageProvider> = {
  fal: new FalProvider(),
  kie: new KieProvider(),
};

export function getProvider(provider: Provider): ImageProvider {
  return providerInstances[provider];
}

export type { ImageProvider, ProviderGenerateInput, ProviderGenerateResult, OnStatusUpdate } from "./types";
