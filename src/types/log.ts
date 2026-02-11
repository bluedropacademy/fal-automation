export interface LogEntry {
  timestamp: string;
  batchId: string;
  imageIndex: number;
  prompt: string;
  parameters: {
    resolution: string;
    aspectRatio: string;
    outputFormat: string;
    safetyTolerance: number;
    numImages: number;
    seed?: number;
    enableWebSearch: boolean;
    hasReferenceImages: boolean;
  };
  status: "completed" | "failed";
  durationMs: number;
  resultUrl?: string;
  width?: number;
  height?: number;
  error?: string;
  requestId?: string;
  cost: number;
}
