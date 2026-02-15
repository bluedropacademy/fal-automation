"use client";

import { useState, useRef, useCallback } from "react";
import { X, Video, Loader2, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { BatchImage } from "@/types/batch";
import { isVideoConfigValid, estimateVideoCost } from "@/lib/constants";

type VideoStatus = "idle" | "generating" | "completed" | "error";

interface VideoResult {
  imageIndex: number;
  imageUrl: string;
  prompt: string;
  videoUrl?: string;
  error?: string;
  status: "pending" | "queued" | "processing" | "completed" | "failed";
  durationMs?: number;
}

interface VideoDialogProps {
  images: BatchImage[];
  onClose: () => void;
}

export function VideoDialog({ images, onClose }: VideoDialogProps) {
  const [duration, setDuration] = useState<"6" | "10">("6");
  const [resolution, setResolution] = useState<"768P" | "1080P">("768P");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<VideoStatus>("idle");
  const [results, setResults] = useState<VideoResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const configValid = isVideoConfigValid(duration, resolution);
  const cost = estimateVideoCost(images.length, duration, resolution);

  const handleGenerate = useCallback(async () => {
    if (!configValid) return;

    const initialResults: VideoResult[] = images.map((img) => ({
      imageIndex: img.index,
      imageUrl: img.result!.url,
      prompt: prompt.trim() || img.rawPrompt,
      status: "pending" as const,
    }));

    setResults(initialResults);
    setStatus("generating");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: initialResults.map((r) => ({
            index: r.imageIndex,
            imageUrl: r.imageUrl,
            prompt: r.prompt,
          })),
          duration,
          resolution,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "video_update" && event.index !== undefined) {
              setResults((prev) =>
                prev.map((r) =>
                  r.imageIndex === event.index
                    ? {
                        ...r,
                        status: event.status,
                        ...(event.videoUrl && { videoUrl: event.videoUrl }),
                        ...(event.error && { error: event.error }),
                        ...(event.durationMs !== undefined && { durationMs: event.durationMs }),
                      }
                    : r
                )
              );
            } else if (event.type === "batch_complete") {
              setStatus("completed");
            } else if (event.type === "batch_error") {
              setStatus("error");
            }
          } catch {
            // Skip malformed SSE events
          }
        }
      }

      // If stream ended without explicit batch_complete
      setStatus((prev) => (prev === "generating" ? "completed" : prev));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        setResults([]);
      } else {
        setStatus("error");
        toast.error("שגיאה ביצירת וידאו", {
          description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        });
      }
    } finally {
      abortRef.current = null;
    }
  }, [images, duration, resolution, prompt, configValid]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleDownloadVideo = useCallback((videoUrl: string, index: number) => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `video-${String(index + 1).padStart(3, "0")}.mp4`;
    a.target = "_blank";
    a.click();
  }, []);

  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== "generating") onClose();
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
            onClick={onClose}
            disabled={status === "generating"}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selected images preview */}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">
            {images.length} תמונות נבחרו
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img) => (
              <img
                key={img.id}
                src={img.result!.url}
                alt={img.rawPrompt}
                className="h-16 w-16 rounded-lg object-cover border border-border shrink-0"
              />
            ))}
          </div>
        </div>

        {/* Configuration (only shown before generation starts) */}
        {status === "idle" && (
          <>
            {/* Prompt override */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1">
                פרומפט לוידאו (אופציונלי)
              </label>
              <textarea
                dir="ltr"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Leave empty to use each image's original prompt"
                rows={2}
                className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                אם ריק, ישמש הפרומפט המקורי של כל תמונה
              </p>
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
              disabled={!configValid}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Video className="h-4 w-4" />
              צור {images.length} וידאו
            </button>
          </>
        )}

        {/* Generation Progress & Results */}
        {(status === "generating" || status === "completed" || status === "error") && (
          <div className="space-y-3">
            {/* Progress summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {status === "generating" && (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    מייצר וידאו...
                  </span>
                )}
                {status === "completed" && `הושלם: ${completedCount}/${results.length}`}
                {status === "error" && "שגיאה ביצירה"}
              </span>
              {failedCount > 0 && (
                <span className="text-destructive text-xs">{failedCount} נכשלו</span>
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
                  {result.status === "pending" && (
                    <p className="text-xs text-muted-foreground mt-1">ממתין...</p>
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
                          onClick={() => handleDownloadVideo(result.videoUrl!, result.imageIndex)}
                          className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-medium hover:bg-gray-200 transition-colors"
                        >
                          <Download className="h-3 w-3" />
                          הורד וידאו
                        </button>
                        {result.durationMs && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(result.durationMs / 1000)}s
                          </span>
                        )}
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
                  ביטול
                </button>
              ) : (
                <button
                  onClick={onClose}
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
