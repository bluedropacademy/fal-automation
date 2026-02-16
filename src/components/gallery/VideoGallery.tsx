"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Download,
  Video,
  Play,
  X,
  Loader2,
  RotateCcw,
  Square,
  Sparkles,
  ChevronDown,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { useBatch } from "@/hooks/useBatch";
import { useWakeLock } from "@/hooks/useWakeLock";
import { saveBatchToHistory, loadGeminiPresets, type GeminiPreset } from "@/lib/persistence";
import { SectionCard } from "@/components/common/SectionCard";
import {
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_MAX_DURATION_MS,
  MAX_ACTIVE_VIDEO_TASKS,
  isVideoConfigValid,
  estimateVideoCost,
  getVideoModelId,
  DEFAULT_GEMINI_SYSTEM_PROMPT,
  GEMINI_PROMPT_PRESETS,
  type VideoModel,
} from "@/lib/constants";
import type { Batch, BatchImage } from "@/types/batch";

// --- Types ---

interface LiveStatus {
  status: string;
  videoUrl?: string;
  error?: string;
  requestId?: string;
}

interface ImagePromptState {
  prompt: string;
  analysisStatus: "idle" | "analyzing" | "completed" | "error";
  error?: string;
}

// ===================================================================
// VideoGallery — handles both configuration (idle) and lifecycle
// ===================================================================

export function VideoGallery() {
  const { state, dispatch } = useBatch();
  const batch = state.currentBatch;

  // --- UI state ---
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [polling, setPolling] = useState(false);

  // --- Config state (only used in idle phase) ---
  const [videoModel, setVideoModel] = useState<VideoModel>("pro");
  const [duration, setDuration] = useState<"6" | "10">("6");
  const [resolution, setResolution] = useState<"768P" | "1080P">("768P");
  const [imagePrompts, setImagePrompts] = useState<Map<number, ImagePromptState>>(new Map());
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [localSystemPrompt, setLocalSystemPrompt] = useState(DEFAULT_GEMINI_SYSTEM_PROMPT);
  const [showPromptConfig, setShowPromptConfig] = useState(false);
  const [customPresets, setCustomPresets] = useState<GeminiPreset[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  // Prevent laptop sleep while videos are generating
  useWakeLock(polling);

  // ESC key to close video player
  useEffect(() => {
    if (playingIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayingIndex(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [playingIndex]);

  // --- Live statuses (ref = source of truth for polling, state = UI) ---
  const [liveStatuses, setLiveStatuses] = useState<Map<number, LiveStatus>>(new Map());
  const liveStatusesRef = useRef<Map<number, LiveStatus>>(new Map());
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const pollStartTimeRef = useRef(0);
  const autoStartedRef = useRef<string | null>(null);
  const batchRef = useRef(batch);
  batchRef.current = batch;

  // --- Initialize config prompts when batch loads in idle state ---
  useEffect(() => {
    if (!batch || batch.type !== "video" || batch.status !== "idle") return;
    const map = new Map<number, ImagePromptState>();
    for (const img of batch.images) {
      map.set(img.index, { prompt: img.rawPrompt, analysisStatus: "idle" });
    }
    setImagePrompts(map);
  }, [batch?.id]);

  // Load custom Gemini presets
  useEffect(() => {
    loadGeminiPresets().then(setCustomPresets);
  }, []);

  // Use gemini system prompt from settings if available
  useEffect(() => {
    if (state.settings.geminiSystemPrompt) {
      setLocalSystemPrompt(state.settings.geminiSystemPrompt);
    }
  }, [state.settings.geminiSystemPrompt]);

  // --- Helpers ---

  const updateLiveStatus = useCallback((index: number, value: LiveStatus) => {
    const next = new Map(liveStatusesRef.current);
    next.set(index, value);
    liveStatusesRef.current = next;
    setLiveStatuses(next);
  }, []);

  const getItemStatus = useCallback(
    (item: BatchImage) => liveStatuses.get(item.index)?.status ?? item.status,
    [liveStatuses]
  );

  const getItemVideoUrl = useCallback(
    (item: BatchImage) => liveStatuses.get(item.index)?.videoUrl ?? item.videoUrl,
    [liveStatuses]
  );

  // --- Derived state ---

  const completedVideos =
    batch?.images.filter((img) => {
      return getItemStatus(img) === "completed" && getItemVideoUrl(img);
    }) ?? [];

  const totalCount = batch?.images.length ?? 0;
  const completedCount = completedVideos.length;
  const failedCount =
    batch?.images.filter((img) => getItemStatus(img) === "failed").length ?? 0;
  const inProgressCount = totalCount - completedCount - failedCount;

  const hasWorkToDo =
    batch?.images.some((img) => {
      const status = getItemStatus(img);
      return status !== "completed" && status !== "failed";
    }) ?? false;

  const canResume =
    batch &&
    !polling &&
    (batch.status === "interrupted" || batch.status === "error") &&
    hasWorkToDo;

  const configValid = isVideoConfigValid(duration, resolution);
  const cost = batch ? estimateVideoCost(batch.images.length, duration, resolution, videoModel) : 0;

  // ===================================================================
  // CONFIG PHASE: Gemini analysis + prompt editing
  // ===================================================================

  const updateImagePrompt = useCallback((index: number, prompt: string) => {
    setImagePrompts((prev) => {
      const next = new Map(prev);
      const current = next.get(index)!;
      next.set(index, { ...current, prompt });
      return next;
    });
  }, []);

  const handleAnalyzeAll = useCallback(async () => {
    if (!batch) return;
    setIsAnalyzingAll(true);

    setImagePrompts((prev) => {
      const next = new Map(prev);
      for (const img of batch.images) {
        const current = next.get(img.index)!;
        next.set(img.index, { ...current, analysisStatus: "analyzing", error: undefined });
      }
      return next;
    });

    const promises = batch.images.map(async (img) => {
      try {
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: img.sourceImageUrl,
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
          next.set(img.index, { prompt: data.prompt, analysisStatus: "completed" });
          return next;
        });
      } catch (error) {
        setImagePrompts((prev) => {
          const next = new Map(prev);
          const current = next.get(img.index)!;
          next.set(img.index, {
            ...current,
            analysisStatus: "error",
            error: error instanceof Error ? error.message : "שגיאה לא ידועה",
          });
          return next;
        });
      }
    });

    await Promise.allSettled(promises);
    setIsAnalyzingAll(false);
  }, [batch, localSystemPrompt]);

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
            imageUrl: img.sourceImageUrl,
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

  // ===================================================================
  // GENERATION LIFECYCLE: task creation, polling, slot filling
  // ===================================================================

  const createVideoTask = useCallback(
    async (
      img: BatchImage,
      videoSettings: NonNullable<Batch["videoSettings"]>
    ): Promise<{ taskId?: string; error?: string }> => {
      try {
        const res = await fetch("/api/generate-video/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: img.index,
            imageUrl: img.sourceImageUrl,
            prompt: img.rawPrompt,
            duration: videoSettings.duration,
            resolution: videoSettings.resolution,
            model: videoSettings.model,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          return { error: data.error || "Task creation failed" };
        }
        return { taskId: data.taskId };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Network error" };
      }
    },
    []
  );

  const fillSlots = useCallback(
    async (batchData: Batch) => {
      if (stoppedRef.current || !batchData.videoSettings) return;
      const currentStatuses = liveStatusesRef.current;

      const activeCount = batchData.images.filter((img) => {
        const live = currentStatuses.get(img.index);
        const requestId = live?.requestId ?? img.requestId;
        const status = live?.status ?? img.status;
        return requestId && status !== "completed" && status !== "failed";
      }).length;

      const slotsAvailable = MAX_ACTIVE_VIDEO_TASKS - activeCount;
      if (slotsAvailable <= 0) return;

      const pending = batchData.images.filter((img) => {
        const live = currentStatuses.get(img.index);
        const requestId = live?.requestId ?? img.requestId;
        const status = live?.status ?? img.status;
        return !requestId && status !== "completed" && status !== "failed";
      });

      const toCreate = pending.slice(0, slotsAvailable);
      for (const img of toCreate) {
        if (stoppedRef.current) break;
        updateLiveStatus(img.index, { status: "creating", requestId: undefined });
        const result = await createVideoTask(img, batchData.videoSettings);
        if (result.taskId) {
          updateLiveStatus(img.index, { status: "queued", requestId: result.taskId });
        } else {
          updateLiveStatus(img.index, { status: "failed", error: result.error });
        }
      }
    },
    [createVideoTask, updateLiveStatus]
  );

  const buildFinalBatch = useCallback(
    (batchData: Batch, statuses: Map<number, LiveStatus>, batchStatus: Batch["status"]): Batch => {
      const updatedImages: BatchImage[] = batchData.images.map((img) => {
        const live = statuses.get(img.index);
        if (!live) return img;
        const mapStatus = (s: string): BatchImage["status"] => {
          switch (s) {
            case "completed": return "completed";
            case "failed": return "failed";
            case "queued": return "queued";
            case "processing": return "processing";
            case "creating": return "queued";
            default: return img.status;
          }
        };
        return {
          ...img,
          status: mapStatus(live.status),
          videoUrl: live.videoUrl ?? img.videoUrl,
          requestId: live.requestId ?? img.requestId,
          error: live.error ?? img.error,
          completedAt: live.status === "completed" ? new Date().toISOString() : img.completedAt,
        };
      });
      return {
        ...batchData,
        status: batchStatus,
        images: updatedImages,
        ...(batchStatus !== "running" && { completedAt: new Date().toISOString() }),
      };
    },
    []
  );

  const saveBatch = useCallback(
    async (batchData: Batch, batchStatus: Batch["status"], updateContext = false) => {
      const finalBatch = buildFinalBatch(batchData, liveStatusesRef.current, batchStatus);
      await saveBatchToHistory(finalBatch);
      window.dispatchEvent(new Event("videoBatchSaved"));
      if (updateContext) {
        dispatch({ type: "VIEW_HISTORY_BATCH", batch: finalBatch });
      }
    },
    [buildFinalBatch, dispatch]
  );

  // --- Core polling ---

  const startPolling = useCallback(() => {
    const batchData = batchRef.current;
    if (!batchData || polling) return;

    setPolling(true);
    stoppedRef.current = false;
    pollStartTimeRef.current = Date.now();

    const stopPolling = (newStatus: "completed" | "interrupted") => {
      stoppedRef.current = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      setPolling(false);
      saveBatch(batchData, newStatus, true);
      if (newStatus === "completed") {
        toast.success("יצירת הוידאו הושלמה!");
      } else {
        toast.info("הופסק — ניתן להמשיך מכפתור ההמשך");
      }
    };

    const scheduleNext = () => {
      if (stoppedRef.current) return;
      pollingRef.current = setTimeout(pollOnce, VIDEO_POLL_INTERVAL_MS);
    };

    const pollOnce = async () => {
      if (stoppedRef.current) return;

      if (Date.now() - pollStartTimeRef.current > VIDEO_POLL_MAX_DURATION_MS) {
        stopPolling("interrupted");
        toast.info("הזמן המקסימלי למעקב עבר — ניתן להמשיך מההיסטוריה");
        return;
      }

      const currentStatuses = liveStatusesRef.current;

      // 1. Fill slots
      await fillSlots(batchData);
      if (stoppedRef.current) return;

      // 2. Poll active tasks
      const activeTasks: { index: number; requestId: string }[] = [];
      for (const img of batchData.images) {
        const live = currentStatuses.get(img.index);
        const requestId = live?.requestId ?? img.requestId;
        const status = live?.status ?? img.status;
        if (requestId && status !== "completed" && status !== "failed") {
          activeTasks.push({ index: img.index, requestId });
        }
      }

      if (activeTasks.length > 0) {
        const taskIds = activeTasks.map((t) => t.requestId).join(",");
        try {
          const res = await fetch(`/api/generate-video/poll?taskIds=${taskIds}`);
          if (res.ok) {
            const data = await res.json();
            for (const result of data.results ?? []) {
              const task = activeTasks.find((t) => t.requestId === result.taskId);
              if (!task) continue;
              const current = currentStatuses.get(task.index);

              if (result.state === "success") {
                updateLiveStatus(task.index, {
                  ...current, status: "completed", videoUrl: result.videoUrl, requestId: task.requestId,
                });
              } else if (result.state === "fail") {
                updateLiveStatus(task.index, {
                  ...current, status: "failed", error: result.error, requestId: task.requestId,
                });
              } else if (result.state === "generating") {
                if (current?.status !== "processing") {
                  updateLiveStatus(task.index, { ...current, status: "processing", requestId: task.requestId });
                }
              } else if (result.state === "queuing" || result.state === "waiting") {
                if (current?.status !== "queued") {
                  updateLiveStatus(task.index, { ...current, status: "queued", requestId: task.requestId });
                }
              } else if (result.state === "error") {
                console.warn(`[VideoGallery] Poll error for task ${result.taskId}: ${result.error}`);
              }
            }
          } else {
            console.warn(`[VideoGallery] Poll API returned ${res.status}`);
          }
        } catch (err) {
          console.warn("[VideoGallery] Poll network error:", err);
        }
      }

      // 3. Check completion
      const updatedStatuses = liveStatusesRef.current;
      const allDone = batchData.images.every((img) => {
        const live = updatedStatuses.get(img.index);
        const status = live?.status ?? img.status;
        return status === "completed" || status === "failed";
      });

      if (allDone) {
        stopPolling("completed");
        return;
      }

      // 4. Periodic save
      await saveBatch(batchData, "running");

      // 5. Next cycle
      scheduleNext();
    };

    pollOnce();
  }, [polling, fillSlots, updateLiveStatus, saveBatch]);

  const handleStop = useCallback(async () => {
    stoppedRef.current = true;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
    const batchData = batchRef.current;
    if (batchData) {
      await saveBatch(batchData, "interrupted", true);
    }
  }, [saveBatch]);

  // --- Generate: transition from idle → running ---

  const handleGenerate = useCallback(async () => {
    if (!batch || !configValid || isStarting) return;
    setIsStarting(true);

    const modelId = getVideoModelId(videoModel);
    const videoSettings = { duration, resolution, model: modelId };

    // Update batch images with edited prompts
    const updatedImages: BatchImage[] = batch.images.map((img) => {
      const promptState = imagePrompts.get(img.index);
      const editedPrompt = promptState?.prompt || img.rawPrompt;
      return {
        ...img,
        rawPrompt: editedPrompt,
        fullPrompt: editedPrompt,
      };
    });

    // Create first batch of tasks
    const firstBatch = updatedImages.slice(0, MAX_ACTIVE_VIDEO_TASKS);
    for (const img of firstBatch) {
      try {
        const res = await fetch("/api/generate-video/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: img.index,
            imageUrl: img.sourceImageUrl,
            prompt: img.rawPrompt,
            duration,
            resolution,
            model: modelId,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          img.status = "failed";
          img.error = data.error || "Task creation failed";
        } else {
          img.requestId = data.taskId;
          img.status = "queued";
        }
      } catch (err) {
        img.status = "failed";
        img.error = err instanceof Error ? err.message : "Network error";
      }
    }

    // Build running batch
    const runningBatch: Batch = {
      ...batch,
      status: "running",
      images: updatedImages,
      videoSettings,
      estimatedCost: estimateVideoCost(updatedImages.length, duration, resolution, videoModel),
    };

    // Save and switch context
    await saveBatchToHistory(runningBatch);
    window.dispatchEvent(new Event("videoBatchSaved"));
    dispatch({ type: "VIEW_HISTORY_BATCH", batch: runningBatch });

    setIsStarting(false);
    // Auto-start polling will pick up from the "running" status via useEffect
  }, [batch, configValid, isStarting, videoModel, duration, resolution, imagePrompts, dispatch]);

  // --- Auto-start polling for "running" batches ---

  useEffect(() => {
    if (!batch || batch.type !== "video" || batch.status !== "running") return;
    if (polling) return;
    if (autoStartedRef.current === batch.id) return;

    autoStartedRef.current = batch.id;
    const timer = setTimeout(() => startPolling(), 100);
    return () => clearTimeout(timer);
  }, [batch?.id, batch?.status, batch?.type, polling, startPolling]);

  // --- Cleanup on unmount ---

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      const batchData = batchRef.current;
      if (batchData && batchData.status === "running") {
        const finalBatch = {
          ...batchData,
          status: "interrupted" as const,
          completedAt: new Date().toISOString(),
        };
        saveBatchToHistory(finalBatch);
        window.dispatchEvent(new Event("videoBatchSaved"));
      }
    };
  }, []);

  // --- Back to image batch ---

  const handleBackToImages = useCallback(() => {
    if (polling) {
      handleStop();
    }
    dispatch({ type: "BACK_TO_CURRENT" });
  }, [polling, handleStop, dispatch]);

  // --- Downloads ---

  const handleDownloadAll = useCallback(async () => {
    if (!batch || completedVideos.length === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const digits = Math.max(3, String(completedVideos.length).length);
      await Promise.all(
        completedVideos.map(async (img) => {
          try {
            const videoUrl = getItemVideoUrl(img);
            if (!videoUrl) return;
            const res = await fetch(videoUrl);
            if (!res.ok) return;
            const blob = await res.blob();
            const idx = String(img.index + 1).padStart(digits, "0");
            zip.file(`video-${idx}.mp4`, blob);
          } catch { /* skip */ }
        })
      );
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batch.name || "videos"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("ההורדה הושלמה!", { description: `${completedVideos.length} סרטונים הורדו כ-ZIP` });
    } catch (error) {
      toast.error("שגיאה בהורדה", {
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
    } finally {
      setDownloading(false);
    }
  }, [batch, completedVideos, getItemVideoUrl]);

  const handleDownloadSingle = useCallback((videoUrl: string, index: number) => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `video-${String(index + 1).padStart(3, "0")}.mp4`;
    a.target = "_blank";
    a.click();
  }, []);

  // ===================================================================
  // RENDER
  // ===================================================================

  if (!batch || batch.type !== "video") return null;

  const isIdle = batch.status === "idle";

  const playingVideo =
    playingIndex !== null
      ? batch.images.find((img) => img.index === playingIndex)
      : null;

  return (
    <SectionCard
      title="גלריית וידאו"
      icon={<Video className="h-4 w-4" />}
      headerAction={
        <div className="flex items-center gap-2">
          {/* Back to images button */}
          {state.viewingHistory && !polling && (
            <button
              onClick={handleBackToImages}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              חזרה לתמונות
            </button>
          )}
          {/* Resume button */}
          {canResume && (
            <button
              onClick={startPolling}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              המשך ({inProgressCount} נותרו)
            </button>
          )}
          {/* Stop button */}
          {polling && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              עצור
            </button>
          )}
          {/* Download all */}
          {completedVideos.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? "מוריד..." : `הורד הכל (${completedVideos.length})`}
            </button>
          )}
        </div>
      }
    >
      {/* ============================================================ */}
      {/* IDLE PHASE: Configuration UI                                 */}
      {/* ============================================================ */}
      {isIdle && (
        <div className="space-y-4" dir="rtl">
          {/* Gemini prompt config (collapsible) */}
          <div className="rounded-lg border border-accent-border/60 bg-accent-muted/50">
            <button
              onClick={() => setShowPromptConfig((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-accent hover:bg-accent-muted/50 transition-colors rounded-lg"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                הגדרות Gemini
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showPromptConfig ? "rotate-180" : ""}`} />
            </button>
            {showPromptConfig && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {GEMINI_PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setLocalSystemPrompt(preset.prompt)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        localSystemPrompt === preset.prompt
                          ? "bg-accent-muted text-accent ring-1 ring-accent-border"
                          : "bg-white border border-border text-muted-foreground hover:border-accent-border/60 hover:text-accent"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {customPresets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customPresets.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setLocalSystemPrompt(preset.prompt)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          localSystemPrompt === preset.prompt
                            ? "bg-accent-muted text-accent ring-1 ring-accent-border"
                            : "bg-white border border-border text-muted-foreground hover:border-accent-border/60 hover:text-accent"
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  dir="ltr"
                  value={localSystemPrompt}
                  onChange={(e) => setLocalSystemPrompt(e.target.value)}
                  rows={3}
                  className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  placeholder="System prompt for Gemini image analysis..."
                />
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                פרומפטים לוידאו ({batch.images.length} תמונות)
              </label>
              <button
                onClick={handleAnalyzeAll}
                disabled={isAnalyzingAll}
                className="flex items-center gap-1.5 rounded-lg bg-accent-muted/50 border border-accent-border/60 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-muted disabled:opacity-50 transition-colors"
              >
                {isAnalyzingAll ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> מנתח תמונות...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> ניתוח אוטומטי (Gemini)</>
                )}
              </button>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {batch.images.map((img) => {
                const promptState = imagePrompts.get(img.index);
                if (!promptState) return null;
                return (
                  <div key={img.id} className="flex gap-3 items-start">
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <img
                        src={img.sourceImageUrl}
                        alt=""
                        className="h-14 w-14 rounded-lg object-cover border border-border"
                      />
                      <button
                        onClick={() => handleAnalyzeSingle(img.index, img)}
                        disabled={promptState.analysisStatus === "analyzing" || isAnalyzingAll}
                        title="ניתוח מחדש (Gemini)"
                        className="flex items-center justify-center h-6 w-6 rounded-md border border-accent-border/60 bg-accent-muted/50 text-accent hover:bg-accent-muted hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                          onChange={(e) => updateImagePrompt(img.index, e.target.value)}
                          rows={2}
                          disabled={promptState.analysisStatus === "analyzing"}
                          className="input-base w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y disabled:opacity-50"
                          placeholder="Prompt for video generation..."
                        />
                        {promptState.analysisStatus === "analyzing" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-md">
                            <Loader2 className="h-4 w-4 animate-spin text-accent" />
                          </div>
                        )}
                      </div>
                      {promptState.analysisStatus === "error" && (
                        <p className="text-xs text-destructive mt-1">{promptState.error || "שגיאה בניתוח"}</p>
                      )}
                      {promptState.analysisStatus === "completed" && (
                        <p className="text-xs text-green-600 mt-1">נוצר אוטומטית</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">מודל</label>
            <div className="flex gap-2">
              {(["pro", "standard"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setVideoModel(m)}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    videoModel === m
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {m === "pro" ? "Pro (איכות גבוהה)" : "Standard (מהיר וזול)"}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">משך וידאו</label>
            <div className="flex gap-2">
              {(["6", "10"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    duration === d
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {d} שניות
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">רזולוציה</label>
            <div className="flex gap-2">
              {(["768P", "1080P"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    resolution === r
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Validation warning */}
          {!configValid && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              משך 10 שניות אינו זמין ברזולוציה 1080P
            </div>
          )}

          {/* Cost estimate */}
          <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            עלות משוערת: ₪{cost.toFixed(2)} ({batch.images.length} וידאו)
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!configValid || isAnalyzingAll || isStarting}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isStarting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> מתחיל יצירה...</>
            ) : (
              <><Video className="h-4 w-4" /> צור {batch.images.length} וידאו</>
            )}
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* GENERATION / RESULTS PHASE                                   */}
      {/* ============================================================ */}
      {!isIdle && (
        <>
          {/* Video settings info */}
          {batch.videoSettings && (
            <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-3">
              <span>משך: {batch.videoSettings.duration}s</span>
              <span>רזולוציה: {batch.videoSettings.resolution}</span>
              <span>מודל: {batch.videoSettings.model.includes("pro") ? "Pro" : "Standard"}</span>
            </div>
          )}

          {/* Progress bar */}
          {(polling || completedCount > 0 || failedCount > 0) && totalCount > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  {polling && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  {polling
                    ? `מייצר וידאו... (${completedCount}/${totalCount})`
                    : batch.status === "completed"
                      ? `הושלם: ${completedCount}/${totalCount}`
                      : batch.status === "interrupted"
                        ? `הופסק: ${completedCount}/${totalCount} הושלמו`
                        : `${completedCount}/${totalCount}`}
                </span>
                {failedCount > 0 && (
                  <span className="text-destructive">{failedCount} נכשלו</span>
                )}
              </div>
              <div className="h-2.5 rounded-full bg-muted/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Video grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {batch.images.map((item) => {
              const itemStatus = getItemStatus(item);
              const itemVideoUrl = getItemVideoUrl(item);

              return (
                <div
                  key={item.id}
                  className="card-interactive group relative rounded-xl border border-border/80 overflow-hidden bg-card"
                >
                  <div
                    className="relative aspect-video cursor-pointer"
                    onClick={() => {
                      if (itemStatus === "completed" && itemVideoUrl) {
                        setPlayingIndex(item.index);
                      }
                    }}
                  >
                    {item.sourceImageUrl ? (
                      <img src={item.sourceImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-muted flex items-center justify-center">
                        <Video className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}

                    {itemStatus === "completed" && itemVideoUrl && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="rounded-full bg-white/90 p-3 shadow-lg">
                          <Play className="h-6 w-6 text-primary fill-primary" />
                        </div>
                      </div>
                    )}
                    {(itemStatus === "pending" || itemStatus === "creating") && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="text-xs text-white font-medium">ממתין</span>
                      </div>
                    )}
                    {(itemStatus === "queued" || itemStatus === "processing") && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      </div>
                    )}
                    {itemStatus === "failed" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-900/30">
                        <span className="text-xs text-white font-medium">נכשל</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2">
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">
                      {item.rawPrompt}
                    </p>
                    {itemStatus === "completed" && itemVideoUrl && (
                      <button
                        onClick={() => handleDownloadSingle(itemVideoUrl, item.index)}
                        className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        הורד
                      </button>
                    )}
                    {itemStatus === "failed" && (
                      <p className="mt-1 text-xs text-destructive truncate">
                        {liveStatuses.get(item.index)?.error || item.error || "שגיאה"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Video Player Modal */}
      {playingVideo && getItemVideoUrl(playingVideo) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPlayingIndex(null)}
        >
          <div
            className="relative max-w-3xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPlayingIndex(null)}
              className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <video
              src={getItemVideoUrl(playingVideo)!}
              controls
              autoPlay
              className="w-full rounded-xl shadow-2xl"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-white/70 truncate flex-1" dir="ltr">
                {playingVideo.rawPrompt}
              </p>
              <button
                onClick={() => handleDownloadSingle(getItemVideoUrl(playingVideo)!, playingVideo.index)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors mr-3"
              >
                <Download className="h-3.5 w-3.5" />
                הורד
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
