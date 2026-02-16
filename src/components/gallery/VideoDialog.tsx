"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Video,
  Loader2,
  Download,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import type { Batch, BatchImage } from "@/types/batch";
import { generateBatchId, uid } from "@/lib/format-utils";
import { saveBatchToHistory, loadGeminiPresets, type GeminiPreset } from "@/lib/persistence";
import {
  isVideoConfigValid,
  estimateVideoCost,
  getVideoModelId,
  DEFAULT_GEMINI_SYSTEM_PROMPT,
  DEFAULT_SETTINGS,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_MAX_DURATION_MS,
  GEMINI_PROMPT_PRESETS,
  type VideoModel,
} from "@/lib/constants";

const MAX_ACTIVE_TASKS = 2;

type VideoStatus = "idle" | "generating" | "completed" | "error" | "interrupted";
type AnalysisStatus = "idle" | "analyzing" | "completed" | "error";

interface VideoResult {
  imageIndex: number;
  imageUrl: string;
  prompt: string;
  taskId?: string;
  videoUrl?: string;
  error?: string;
  status: "pending" | "creating" | "queued" | "processing" | "completed" | "failed";
}

interface ImagePromptState {
  prompt: string;
  analysisStatus: AnalysisStatus;
  error?: string;
}

interface VideoDialogProps {
  images: BatchImage[];
  onClose: () => void;
}

function buildInitialPrompts(
  images: BatchImage[]
): Map<number, ImagePromptState> {
  const map = new Map<number, ImagePromptState>();
  for (const img of images) {
    map.set(img.index, {
      prompt: img.rawPrompt,
      analysisStatus: "idle",
    });
  }
  return map;
}

export function VideoDialog({ images, onClose }: VideoDialogProps) {
  const { state } = useBatch();
  const geminiSystemPrompt =
    state.settings.geminiSystemPrompt || DEFAULT_GEMINI_SYSTEM_PROMPT;

  const [videoModel, setVideoModel] = useState<VideoModel>("pro");
  const [duration, setDuration] = useState<"6" | "10">("6");
  const [resolution, setResolution] = useState<"768P" | "1080P">("768P");
  const [status, setStatus] = useState<VideoStatus>("idle");
  const [results, setResults] = useState<VideoResult[]>([]);
  const [imagePrompts, setImagePrompts] = useState<
    Map<number, ImagePromptState>
  >(() => buildInitialPrompts(images));
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [localSystemPrompt, setLocalSystemPrompt] = useState(geminiSystemPrompt);
  const [showPromptConfig, setShowPromptConfig] = useState(false);
  const [customPresets, setCustomPresets] = useState<GeminiPreset[]>([]);

  // Load custom Gemini presets from IndexedDB
  useEffect(() => {
    loadGeminiPresets().then(setCustomPresets);
  }, []);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<VideoResult[]>([]);
  const videoBatchRef = useRef<Batch | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const stoppedRef = useRef(false);
  // Track which image indices are still waiting to be created as tasks
  const pendingQueueRef = useRef<number[]>([]);
  // Track generation config for creating new tasks
  const genConfigRef = useRef<{ duration: string; resolution: string; model: string } | null>(null);

  const configValid = isVideoConfigValid(duration, resolution);
  const cost = estimateVideoCost(images.length, duration, resolution, videoModel);

  // Keep resultsRef in sync
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // --- Persist video batch to history ---

  const persistBatch = useCallback(async (
    batchResults: VideoResult[],
    batchStatus: "running" | "completed" | "error" | "interrupted",
    batch: Batch
  ) => {
    const mapStatus = (resultStatus: string, fallback: BatchImage["status"]): BatchImage["status"] => {
      switch (resultStatus) {
        case "completed": return "completed";
        case "failed": return "failed";
        case "queued": return "queued";
        case "processing": return "processing";
        case "creating": return "queued";
        default: return fallback;
      }
    };
    const updatedImages: BatchImage[] = batch.images.map((img) => {
      const result = batchResults.find((r) => r.imageIndex === img.index);
      if (!result) return img;
      return {
        ...img,
        status: mapStatus(result.status, img.status),
        videoUrl: result.videoUrl,
        requestId: result.taskId,
        error: result.error,
        completedAt: result.status === "completed" ? new Date().toISOString() : undefined,
      };
    });

    const finalBatch: Batch = {
      ...batch,
      status: batchStatus,
      images: updatedImages,
      ...(batchStatus !== "running" && { completedAt: new Date().toISOString() }),
    };

    videoBatchRef.current = finalBatch;
    await saveBatchToHistory(finalBatch);
    window.dispatchEvent(new Event("videoBatchSaved"));
  }, []);

  // --- Close helper: always synchronous ---

  const handleClose = useCallback(() => {
    stoppedRef.current = true;
    pendingQueueRef.current = [];
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    // Save interrupted state if generation was active
    const batch = videoBatchRef.current;
    if (batch && status === "generating") {
      persistBatch(resultsRef.current, "interrupted", batch);
    }
    onClose();
  }, [onClose, status, persistBatch]);

  // --- Per-image prompt helpers ---

  const updateImagePrompt = useCallback(
    (index: number, prompt: string) => {
      setImagePrompts((prev) => {
        const next = new Map(prev);
        const current = next.get(index)!;
        next.set(index, { ...current, prompt });
        return next;
      });
    },
    []
  );

  const handleAnalyzeAll = useCallback(async () => {
    setIsAnalyzingAll(true);

    setImagePrompts((prev) => {
      const next = new Map(prev);
      for (const img of images) {
        const current = next.get(img.index)!;
        next.set(img.index, {
          ...current,
          analysisStatus: "analyzing",
          error: undefined,
        });
      }
      return next;
    });

    const promises = images.map(async (img) => {
      try {
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: img.result!.url,
            systemPrompt: localSystemPrompt,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setImagePrompts((prev) => {
          const next = new Map(prev);
          next.set(img.index, {
            prompt: data.prompt,
            analysisStatus: "completed",
          });
          return next;
        });
      } catch (error) {
        setImagePrompts((prev) => {
          const next = new Map(prev);
          const current = next.get(img.index)!;
          next.set(img.index, {
            ...current,
            analysisStatus: "error",
            error:
              error instanceof Error ? error.message : "שגיאה לא ידועה",
          });
          return next;
        });
      }
    });

    await Promise.allSettled(promises);
    setIsAnalyzingAll(false);
  }, [images, localSystemPrompt]);

  const handleAnalyzeSingle = useCallback(
    async (index: number, img: BatchImage) => {
      setImagePrompts((prev) => {
        const next = new Map(prev);
        const current = next.get(index)!;
        next.set(index, { ...current, analysisStatus: "analyzing", error: undefined });
        return next;
      });

      try {
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: img.result!.url,
            systemPrompt: localSystemPrompt,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setImagePrompts((prev) => {
          const next = new Map(prev);
          next.set(index, { prompt: data.prompt, analysisStatus: "completed" });
          return next;
        });
      } catch (error) {
        setImagePrompts((prev) => {
          const next = new Map(prev);
          const current = next.get(index)!;
          next.set(index, {
            ...current,
            analysisStatus: "error",
            error: error instanceof Error ? error.message : "שגיאה לא ידועה",
          });
          return next;
        });
      }
    },
    [localSystemPrompt]
  );

  // --- Create a single task on Kie AI ---

  const createTask = useCallback(async (imageIndex: number): Promise<void> => {
    if (stoppedRef.current) return;

    const latest = resultsRef.current;
    const result = latest.find((r) => r.imageIndex === imageIndex);
    if (!result) return;

    const config = genConfigRef.current;
    if (!config) return;

    // Mark as creating
    const creating = latest.map((r) =>
      r.imageIndex === imageIndex ? { ...r, status: "creating" as const } : r
    );
    setResults(creating);
    resultsRef.current = creating;

    try {
      const res = await fetch("/api/generate-video/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: imageIndex,
          imageUrl: result.imageUrl,
          prompt: result.prompt,
          duration: config.duration,
          resolution: config.resolution,
          model: config.model,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        const updated = resultsRef.current.map((r) =>
          r.imageIndex === imageIndex
            ? { ...r, status: "failed" as const, error: data.error || "Task creation failed" }
            : r
        );
        setResults(updated);
        resultsRef.current = updated;
        return;
      }

      // Mark as queued with taskId
      const updated = resultsRef.current.map((r) =>
        r.imageIndex === imageIndex
          ? { ...r, taskId: data.taskId, status: "queued" as const }
          : r
      );
      setResults(updated);
      resultsRef.current = updated;

      // Incremental save with taskId
      if (videoBatchRef.current) {
        await persistBatch(updated, "running", videoBatchRef.current);
      }
    } catch (err) {
      const updated = resultsRef.current.map((r) =>
        r.imageIndex === imageIndex
          ? { ...r, status: "failed" as const, error: err instanceof Error ? err.message : "Network error" }
          : r
      );
      setResults(updated);
      resultsRef.current = updated;
    }
  }, [persistBatch]);

  // --- Fill active slots: create tasks up to MAX_ACTIVE_TASKS ---

  const fillSlots = useCallback(async () => {
    if (stoppedRef.current) return;

    const latest = resultsRef.current;
    // Count currently active tasks (have taskId but not completed/failed)
    const activeCount = latest.filter(
      (r) => r.taskId && r.status !== "completed" && r.status !== "failed"
    ).length;

    const slotsAvailable = MAX_ACTIVE_TASKS - activeCount;
    if (slotsAvailable <= 0) return;

    // Take next items from the pending queue
    const toCreate = pendingQueueRef.current.splice(0, slotsAvailable);
    // Create them sequentially (each is fast, ~1-2s)
    for (const idx of toCreate) {
      if (stoppedRef.current) break;
      await createTask(idx);
    }
  }, [createTask]);

  // --- Polling logic ---
  // Uses setTimeout (not setInterval) to guarantee each cycle completes
  // before the next starts — prevents race conditions from overlapping polls.

  const startPolling = useCallback((batch: Batch) => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    pollStartTimeRef.current = Date.now();

    const scheduleNext = () => {
      if (stoppedRef.current) return;
      pollingRef.current = setTimeout(pollOnce, VIDEO_POLL_INTERVAL_MS);
    };

    const pollOnce = async () => {
      if (stoppedRef.current) return;

      // Always read the LATEST results from ref (no stale closure)
      const latest = resultsRef.current;

      // Check if ALL items are done (completed or failed, including pending ones with no taskId)
      const allDone = latest.every(
        (r) => r.status === "completed" || r.status === "failed"
      ) && pendingQueueRef.current.length === 0;

      if (allDone) {
        pollingRef.current = null;
        setStatus("completed");
        await persistBatch(latest, "completed", batch);
        toast.success("יצירת הוידאו הושלמה!");
        return;
      }

      // Check max duration
      if (Date.now() - pollStartTimeRef.current > VIDEO_POLL_MAX_DURATION_MS) {
        pollingRef.current = null;
        setStatus("interrupted");
        await persistBatch(latest, "interrupted", batch);
        toast.info("הזמן המקסימלי למעקב עבר — ניתן להמשיך מההיסטוריה");
        return;
      }

      // Poll active tasks
      const activeTasks = latest.filter(
        (r) => r.taskId && r.status !== "completed" && r.status !== "failed"
      );

      if (activeTasks.length > 0) {
        const taskIds = activeTasks.map((t) => t.taskId!).join(",");

        try {
          const res = await fetch(`/api/generate-video/poll?taskIds=${taskIds}`);
          if (!res.ok) {
            console.warn(`[VideoDialog] Poll API returned ${res.status}`);
            await fillSlots();
            scheduleNext();
            return;
          }

          const data = await res.json();
          let anyChanged = false;

          const nextResults = latest.map((r) => {
            if (!r.taskId) return r;
            const pollResult = data.results?.find((p: { taskId: string }) => p.taskId === r.taskId);
            if (!pollResult) return r;

            if (pollResult.state === "success" && r.status !== "completed") {
              anyChanged = true;
              return { ...r, status: "completed" as const, videoUrl: pollResult.videoUrl };
            } else if (pollResult.state === "fail" && r.status !== "failed") {
              anyChanged = true;
              return { ...r, status: "failed" as const, error: pollResult.error };
            } else if (pollResult.state === "error" && r.status !== "failed") {
              // Transient error from poll — log but keep polling (will retry next cycle)
              console.warn(`[VideoDialog] Poll returned error for task ${r.taskId}: ${pollResult.error}`);
            } else if (pollResult.state === "generating" && r.status !== "processing") {
              anyChanged = true;
              return { ...r, status: "processing" as const };
            } else if (pollResult.state === "queuing" && r.status !== "queued") {
              anyChanged = true;
              return { ...r, status: "queued" as const };
            }
            return r;
          });

          if (anyChanged) {
            setResults(nextResults);
            resultsRef.current = nextResults;
            await persistBatch(nextResults, "running", batch);
          }
        } catch (err) {
          console.warn("[VideoDialog] Poll network error:", err);
        }
      }

      // Fill slots: create new tasks if active count dropped below MAX_ACTIVE_TASKS
      await fillSlots();

      // Schedule next poll AFTER this cycle fully completes
      scheduleNext();
    };

    // Poll immediately, then sequential scheduling
    pollOnce();
  }, [persistBatch, fillSlots]);

  // --- Video generation ---

  const handleGenerate = useCallback(async () => {
    if (!configValid) return;
    stoppedRef.current = false;

    const initialResults: VideoResult[] = images.map((img, i) => ({
      imageIndex: i,
      imageUrl: img.result!.url,
      prompt: imagePrompts.get(img.index)?.prompt || img.rawPrompt,
      status: "pending" as const,
    }));

    const modelId = getVideoModelId(videoModel);
    genConfigRef.current = { duration, resolution, model: modelId };

    // Create a video batch for persistence
    const batchId = generateBatchId();
    const batchImages: BatchImage[] = images.map((img, i) => ({
      id: uid(),
      index: i,
      rawPrompt: imagePrompts.get(img.index)?.prompt || img.rawPrompt,
      fullPrompt: imagePrompts.get(img.index)?.prompt || img.rawPrompt,
      status: "pending" as const,
      sourceImageUrl: img.result!.url,
    }));

    const videoBatch: Batch = {
      id: batchId,
      name: `וידאו ${batchId}`,
      type: "video",
      status: "running",
      images: batchImages,
      settings: state.settings || DEFAULT_SETTINGS,
      createdAt: new Date().toISOString(),
      estimatedCost: cost,
      videoSettings: {
        duration,
        resolution,
        model: modelId,
      },
    };
    videoBatchRef.current = videoBatch;

    setResults(initialResults);
    resultsRef.current = initialResults;
    setStatus("generating");

    // Set up the pending queue — all image indices
    const allIndices = initialResults.map((r) => r.imageIndex);
    pendingQueueRef.current = allIndices.slice(MAX_ACTIVE_TASKS);

    // Create first batch of tasks (up to MAX_ACTIVE_TASKS)
    const firstBatch = allIndices.slice(0, MAX_ACTIVE_TASKS);
    for (const idx of firstBatch) {
      if (stoppedRef.current) break;
      await createTask(idx);
    }

    // Save initial batch with any taskIds from first batch
    await persistBatch(resultsRef.current, "running", videoBatch);

    // Start polling + slot filling
    startPolling(videoBatchRef.current!);
  }, [images, duration, resolution, videoModel, imagePrompts, configValid, cost, state.settings, persistBatch, startPolling, createTask]);

  const handleCancel = useCallback(async () => {
    stoppedRef.current = true;
    pendingQueueRef.current = [];
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setStatus("interrupted");
    const batch = videoBatchRef.current;
    if (batch) {
      await persistBatch(resultsRef.current, "interrupted", batch);
    }
  }, [persistBatch]);

  const handleDownloadVideo = useCallback(
    (videoUrl: string, index: number) => {
      const a = document.createElement("a");
      a.href = videoUrl;
      a.download = `video-${String(index + 1).padStart(3, "0")}.mp4`;
      a.target = "_blank";
      a.click();
    },
    []
  );

  const completedCount = results.filter(
    (r) => r.status === "completed"
  ).length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">
              יצירת וידאו מתמונות
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Configuration (only shown before generation starts) */}
        {status === "idle" && (
          <>
            {/* Gemini prompt config (collapsible) */}
            <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/50">
              <button
                onClick={() => setShowPromptConfig((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100/50 transition-colors rounded-lg"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  הגדרות Gemini
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showPromptConfig ? "rotate-180" : ""}`}
                />
              </button>

              {showPromptConfig && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Built-in presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {GEMINI_PROMPT_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setLocalSystemPrompt(preset.prompt)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          localSystemPrompt === preset.prompt
                            ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300"
                            : "bg-white border border-border text-muted-foreground hover:border-violet-200 hover:text-violet-600"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom presets */}
                  {customPresets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {customPresets.map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => setLocalSystemPrompt(preset.prompt)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                            localSystemPrompt === preset.prompt
                              ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300"
                              : "bg-white border border-border text-muted-foreground hover:border-violet-200 hover:text-violet-600"
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* System prompt textarea */}
                  <textarea
                    dir="ltr"
                    value={localSystemPrompt}
                    onChange={(e) => setLocalSystemPrompt(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    placeholder="System prompt for Gemini image analysis..."
                  />

                  {/* Reset button */}
                  <button
                    onClick={() => setLocalSystemPrompt(DEFAULT_GEMINI_SYSTEM_PROMPT)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    ברירת מחדל
                  </button>
                </div>
              )}
            </div>

            {/* Per-image prompts */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">
                  פרומפטים לוידאו ({images.length} תמונות)
                </label>
                <button
                  onClick={handleAnalyzeAll}
                  disabled={isAnalyzingAll}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
                >
                  {isAnalyzingAll ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      מנתח תמונות...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      ניתוח אוטומטי (Gemini)
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {images.map((img) => {
                  const promptState = imagePrompts.get(img.index)!;
                  return (
                    <div key={img.id} className="flex gap-3 items-start">
                      <div className="shrink-0 flex flex-col items-center gap-1">
                        <img
                          src={img.result!.url}
                          alt=""
                          className="h-14 w-14 rounded-lg object-cover border border-border"
                        />
                        <button
                          onClick={() => handleAnalyzeSingle(img.index, img)}
                          disabled={promptState.analysisStatus === "analyzing" || isAnalyzingAll}
                          title="ניתוח מחדש (Gemini)"
                          className="flex items-center justify-center h-6 w-6 rounded-md border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 hover:text-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {promptState.analysisStatus === "analyzing" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="relative">
                          <textarea
                            dir="ltr"
                            value={promptState.prompt}
                            onChange={(e) =>
                              updateImagePrompt(img.index, e.target.value)
                            }
                            rows={2}
                            disabled={
                              promptState.analysisStatus === "analyzing"
                            }
                            className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y disabled:opacity-50"
                            placeholder="Prompt for video generation..."
                          />
                          {promptState.analysisStatus === "analyzing" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-md">
                              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                            </div>
                          )}
                        </div>
                        {promptState.analysisStatus === "error" && (
                          <p className="text-xs text-destructive mt-1">
                            {promptState.error || "שגיאה בניתוח"}
                          </p>
                        )}
                        {promptState.analysisStatus === "completed" && (
                          <p className="text-xs text-green-600 mt-1">
                            נוצר אוטומטית
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Model selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                מודל
              </label>
              <div className="flex gap-2">
                {(["pro", "standard"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setVideoModel(m)}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      videoModel === m
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-gray-300"
                    }`}
                  >
                    {m === "pro" ? "Pro (איכות גבוהה)" : "Standard (מהיר וזול)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                משך וידאו
              </label>
              <div className="flex gap-2">
                {(["6", "10"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      duration === d
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-gray-300"
                    }`}
                  >
                    {d} שניות
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                רזולוציה
              </label>
              <div className="flex gap-2">
                {(["768P", "1080P"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      resolution === r
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-gray-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Validation warning */}
            {!configValid && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                משך 10 שניות אינו זמין ברזולוציה 1080P
              </div>
            )}

            {/* Cost estimate */}
            <div className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              עלות משוערת: ₪{cost.toFixed(2)} ({images.length} וידאו)
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!configValid || isAnalyzingAll}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Video className="h-4 w-4" />
              צור {images.length} וידאו
            </button>
          </>
        )}

        {/* Generation Progress & Results */}
        {status !== "idle" && (
          <div className="space-y-3">
            {/* Progress summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {status === "generating" && (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    מייצר וידאו... ({completedCount}/{results.length})
                  </span>
                )}
                {status === "completed" &&
                  `הושלם: ${completedCount}/${results.length}`}
                {status === "interrupted" &&
                  `הופסק: ${completedCount}/${results.length} הושלמו`}
                {status === "error" && "שגיאה ביצירה"}
              </span>
              {failedCount > 0 && (
                <span className="text-destructive text-xs">
                  {failedCount} נכשלו
                </span>
              )}
            </div>

            {/* Individual results */}
            {results.map((result) => (
              <div
                key={result.imageIndex}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                {/* Source image thumbnail */}
                <img
                  src={result.imageUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate" dir="ltr">
                    {result.prompt}
                  </p>

                  {/* Status indicators */}
                  {(result.status === "pending" || result.status === "creating") && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ממתין...
                    </p>
                  )}
                  {result.status === "queued" && (
                    <p className="text-xs text-blue-600 mt-1">בתור...</p>
                  )}
                  {result.status === "processing" && (
                    <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      מייצר...
                    </p>
                  )}
                  {result.status === "failed" && (
                    <p className="text-xs text-destructive mt-1">
                      {result.error || "שגיאה"}
                    </p>
                  )}

                  {/* Completed: video player */}
                  {result.status === "completed" && result.videoUrl && (
                    <div className="mt-2">
                      <video
                        src={result.videoUrl}
                        controls
                        className="w-full max-w-sm rounded-lg"
                        preload="metadata"
                      />
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={() =>
                            handleDownloadVideo(
                              result.videoUrl!,
                              result.imageIndex
                            )
                          }
                          className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-medium hover:bg-gray-200 transition-colors"
                        >
                          <Download className="h-3 w-3" />
                          הורד וידאו
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Cancel / Close buttons */}
            <div className="flex gap-2 pt-2">
              {status === "generating" ? (
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  עצור
                </button>
              ) : (
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  סגור
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
