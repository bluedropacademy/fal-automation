"use client";

import { useState, useCallback } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { ImageCard } from "./ImageCard";
import { ImageLightbox } from "./ImageLightbox";

export function ImageGallery() {
  const { state } = useBatch();
  const batch = state.currentBatch;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const completedImages = batch?.images.filter((img) => img.status === "completed") ?? [];

  const handleDownloadAll = useCallback(async () => {
    if (!batch || completedImages.length === 0) return;

    setDownloading(true);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.id,
          images: completedImages.map((img) => ({
            index: img.index,
            url: img.result!.url,
            prompt: img.rawPrompt,
            outputFormat: batch.settings.outputFormat,
          })),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("ההורדה הושלמה!", {
          description: `${data.successCount} תמונות נשמרו ב:\n${data.downloadPath}`,
        });
      } else {
        toast.error("שגיאה בהורדה", { description: data.error });
      }
    } catch (error) {
      toast.error("שגיאה בהורדה", {
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
    } finally {
      setDownloading(false);
    }
  }, [batch, completedImages]);

  if (!batch) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">גלריה</h3>
        {completedImages.length > 0 && (
          <button
            onClick={handleDownloadAll}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading
              ? "מוריד..."
              : `הורד הכל (${completedImages.length})`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {batch.images.map((image) => (
          <ImageCard
            key={image.index}
            image={image}
            onClick={() => setLightboxIndex(image.index)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={batch.images}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
