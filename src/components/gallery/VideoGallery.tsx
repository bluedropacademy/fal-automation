"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Download, Video, Play, X, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { useBatch } from "@/hooks/useBatch";
import { saveBatchToHistory } from "@/lib/persistence";
import { SectionCard } from "@/components/common/SectionCard";
import { VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_MAX_DURATION_MS } from "@/lib/constants";
import type { Batch, BatchImage } from "@/types/batch";

export function VideoGallery() {
  const { state } = useBatch();
  const batch = state.currentBatch;
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [liveStatuses, setLiveStatuses] = useState<Map<number, { status: string; videoUrl?: string; error?: string }>>(new Map());
  const liveStatusesRef = useRef<Map<number, { status: string; videoUrl?: string; error?: string }>>(new Map());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const completedVideos = batch?.images.filter(
    (img) => {
      const live = liveStatuses.get(img.index);
      const status = live?.status ?? img.status;
      const videoUrl = live?.videoUrl ?? img.videoUrl;
      return status === "completed" && videoUrl;
    }
  ) ?? [];

  const pendingOrFailedCount = batch?.images.filter((img) => {
    const live = liveStatuses.get(img.index);
    const status = live?.status ?? img.status;
    return status === "pending" || status === "failed";
  }).length ?? 0;

  // Count images that have requestId (Kie AI taskId) and aren't completed
  const resumableCount = batch?.images.filter((img) => {
    const live = liveStatuses.get(img.index);
    const status = live?.status ?? img.status;
    return img.requestId && status !== "completed";
  }).length ?? 0;

  const canResume = batch && (batch.status === "interrupted" || batch.status === "error" || batch.status === "running") && resumableCount > 0;

  // Helper: update both ref (immediate, for polling) and state (for UI)
  const updateLiveStatus = useCallback((index: number, value: { status: string; videoUrl?: string; error?: string }) => {
    const next = new Map(liveStatusesRef.current);
    next.set(index, value);
    liveStatusesRef.current = next;
    setLiveStatuses(next);
  }, []);

  const handleResume = useCallback(async () => {
    if (!batch) return;

    // Find images with taskIds that aren't completed
    const resumable = batch.images.filter((img) => {
      const live = liveStatusesRef.current.get(img.index);
      const status = live?.status ?? img.status;
      return img.requestId && status !== "completed" && status !== "failed";
    });

    if (resumable.length === 0) {
      toast.info("אין סרטונים להמשך");
      return;
    }

    setResuming(true);
    const pollStartTime = Date.now();

    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setResuming(false);
    };

    const saveFinalBatch = async (batchStatus: "completed" | "interrupted") => {
      const currentStatuses = liveStatusesRef.current;
      const updatedImages: BatchImage[] = batch.images.map((img) => {
        const live = currentStatuses.get(img.index);
        if (!live) return img;
        return {
          ...img,
          status: live.status === "completed" ? "completed" as const : live.status === "failed" ? "failed" as const : img.status,
          videoUrl: live.videoUrl ?? img.videoUrl,
          error: live.error,
          completedAt: live.status === "completed" ? new Date().toISOString() : img.completedAt,
        };
      });
      const finalBatch: Batch = {
        ...batch,
        status: batchStatus,
        images: updatedImages,
        completedAt: new Date().toISOString(),
      };
      await saveBatchToHistory(finalBatch);
      window.dispatchEvent(new Event("videoBatchSaved"));
    };

    const poll = async () => {
      // Read from ref — always has the latest data
      const currentStatuses = liveStatusesRef.current;

      // Check max duration
      if (Date.now() - pollStartTime > VIDEO_POLL_MAX_DURATION_MS) {
        stopPolling();
        await saveFinalBatch("interrupted");
        toast.info("הזמן המקסימלי למעקב עבר — ניתן להמשיך מההיסטוריה");
        return;
      }

      // Get current incomplete tasks
      const taskIds = resumable
        .filter((img) => {
          const live = currentStatuses.get(img.index);
          const currentStatus = live?.status ?? img.status;
          return currentStatus !== "completed" && currentStatus !== "failed";
        })
        .map((img) => img.requestId!)
        .join(",");

      if (!taskIds) {
        // All done
        stopPolling();
        await saveFinalBatch("completed");
        toast.success("יצירת הוידאו הושלמה!");
        return;
      }

      try {
        const res = await fetch(`/api/generate-video/poll?taskIds=${taskIds}`);
        if (!res.ok) return;
        const data = await res.json();

        for (const result of data.results ?? []) {
          const img = resumable.find((i) => i.requestId === result.taskId);
          if (!img) continue;

          if (result.state === "success") {
            updateLiveStatus(img.index, { status: "completed", videoUrl: result.videoUrl });
          } else if (result.state === "fail") {
            updateLiveStatus(img.index, { status: "failed", error: result.error });
          } else if (result.state === "generating") {
            if (currentStatuses.get(img.index)?.status !== "processing") {
              updateLiveStatus(img.index, { status: "processing" });
            }
          }
        }
      } catch {
        // Skip this cycle
      }
    };

    // Poll immediately, then on interval
    poll();
    pollingRef.current = setInterval(poll, VIDEO_POLL_INTERVAL_MS);
  }, [batch, updateLiveStatus]);

  const handleCancelResume = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setResuming(false);
  }, []);

  const handleDownloadAll = useCallback(async () => {
    if (!batch || completedVideos.length === 0) return;

    setDownloading(true);
    try {
      const zip = new JSZip();
      const digits = Math.max(3, String(completedVideos.length).length);

      await Promise.all(
        completedVideos.map(async (img) => {
          try {
            const videoUrl = liveStatuses.get(img.index)?.videoUrl ?? img.videoUrl;
            if (!videoUrl) return;
            const res = await fetch(videoUrl);
            if (!res.ok) return;
            const blob = await res.blob();
            const idx = String(img.index + 1).padStart(digits, "0");
            zip.file(`video-${idx}.mp4`, blob);
          } catch {
            // skip failed
          }
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
      toast.success("ההורדה הושלמה!", {
        description: `${completedVideos.length} סרטונים הורדו כ-ZIP`,
      });
    } catch (error) {
      toast.error("שגיאה בהורדה", {
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
    } finally {
      setDownloading(false);
    }
  }, [batch, completedVideos, liveStatuses]);

  const handleDownloadSingle = useCallback((videoUrl: string, index: number) => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `video-${String(index + 1).padStart(3, "0")}.mp4`;
    a.target = "_blank";
    a.click();
  }, []);

  if (!batch || batch.type !== "video") return null;

  const playingVideo = playingIndex !== null
    ? batch.images.find((img) => img.index === playingIndex)
    : null;

  const getItemStatus = (item: BatchImage) => liveStatuses.get(item.index)?.status ?? item.status;
  const getItemVideoUrl = (item: BatchImage) => liveStatuses.get(item.index)?.videoUrl ?? item.videoUrl;

  return (
    <SectionCard
      title="גלריית וידאו"
      icon={<Video className="h-4 w-4" />}
      headerAction={
        <div className="flex items-center gap-2">
          {canResume && !resuming && (
            <button
              onClick={handleResume}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              המשך ({resumableCount} נותרו)
            </button>
          )}
          {resuming && (
            <button
              onClick={handleCancelResume}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
            >
              עצור
            </button>
          )}
          {completedVideos.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading
                ? "מוריד..."
                : `הורד הכל (${completedVideos.length})`}
            </button>
          )}
        </div>
      }
    >
      {/* Video settings info */}
      {batch.videoSettings && (
        <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-3">
          <span>משך: {batch.videoSettings.duration}s</span>
          <span>רזולוציה: {batch.videoSettings.resolution}</span>
          <span>מודל: {batch.videoSettings.model.includes("pro") ? "Pro" : "Standard"}</span>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {batch.images.map((item) => {
          const itemStatus = getItemStatus(item);
          const itemVideoUrl = getItemVideoUrl(item);

          return (
            <div
              key={item.id}
              className="group relative rounded-xl border border-border overflow-hidden bg-white"
            >
              {/* Thumbnail with play overlay */}
              <div
                className="relative aspect-video cursor-pointer"
                onClick={() => {
                  if (itemStatus === "completed" && itemVideoUrl) {
                    setPlayingIndex(item.index);
                  }
                }}
              >
                {item.sourceImageUrl ? (
                  <img
                    src={item.sourceImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center">
                    <Video className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}

                {/* Status overlay */}
                {itemStatus === "completed" && itemVideoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="rounded-full bg-white/90 p-3 shadow-lg">
                      <Play className="h-6 w-6 text-primary fill-primary" />
                    </div>
                  </div>
                )}
                {itemStatus === "pending" && (
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

              {/* Info bar */}
              <div className="p-2">
                <p className="text-[11px] text-muted-foreground truncate" dir="ltr">
                  {item.rawPrompt}
                </p>
                {itemStatus === "completed" && itemVideoUrl && (
                  <button
                    onClick={() => handleDownloadSingle(itemVideoUrl, item.index)}
                    className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <Download className="h-3 w-3" />
                    הורד
                  </button>
                )}
                {itemStatus === "failed" && item.error && (
                  <p className="mt-1 text-[10px] text-destructive truncate">
                    {item.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Video Player Modal */}
      {playingVideo && (getItemVideoUrl(playingVideo)) && (
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
              className="absolute -top-10 left-0 text-white/70 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
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
