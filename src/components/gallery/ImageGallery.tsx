"use client";

import { useState, useCallback } from "react";
import { Download, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { useBatch } from "@/hooks/useBatch";
import { SectionCard } from "@/components/common/SectionCard";
import { ImageCard } from "./ImageCard";
import { ImageLightbox } from "./ImageLightbox";
import { EditDialog } from "./EditDialog";

export function ImageGallery() {
  const { state } = useBatch();
  const batch = state.currentBatch;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editImageIndex, setEditImageIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const completedImages = batch?.images.filter((img) => img.status === "completed") ?? [];

  const handleDownloadAll = useCallback(async () => {
    if (!batch || completedImages.length === 0) return;

    setDownloading(true);
    try {
      const zip = new JSZip();
      const total = completedImages.length;
      const digits = Math.max(3, String(total).length);

      await Promise.all(
        completedImages.map(async (img) => {
          try {
            const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(img.result!.url)}`);
            if (!res.ok) return;
            const blob = await res.blob();
            const ext = batch.settings.outputFormat || "png";
            const versionSuffix = img.versionLabel ? `-${img.versionLabel}` : "";
            const idx = String(img.index + 1).padStart(digits, "0");
            const filename = `${idx}${versionSuffix}.${ext}`;
            zip.file(filename, blob);
          } catch {
            // skip failed
          }
        })
      );

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batch.name || "images"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("ההורדה הושלמה!", {
        description: `${completedImages.length} תמונות הורדו כ-ZIP`,
      });
    } catch (error) {
      toast.error("שגיאה בהורדה", {
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
    } finally {
      setDownloading(false);
    }
  }, [batch, completedImages]);

  // Empty state
  if (!batch) {
    return (
      <SectionCard
        title="גלריה"
        icon={<ImageIcon className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-2xl bg-primary/5 p-6 mb-4">
            <ImageIcon className="h-12 w-12 text-primary/40" />
          </div>
          <h4 className="text-lg font-semibold text-foreground mb-1">עוד אין תמונות</h4>
          <p className="text-sm text-muted-foreground max-w-xs">
            הזינו פרומפטים למעלה ולחצו &quot;התחל יצירה&quot; כדי לייצר תמונות
          </p>
        </div>
      </SectionCard>
    );
  }

  const editImage = editImageIndex !== null ? batch.images.find((img) => img.index === editImageIndex) : null;

  return (
    <SectionCard
      title="גלריה"
      icon={<ImageIcon className="h-4 w-4" />}
      headerAction={
        completedImages.length > 0 ? (
          <button
            onClick={handleDownloadAll}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading
              ? "מוריד..."
              : `הורד הכל (${completedImages.length})`}
          </button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {batch.images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            onClick={() => setLightboxIndex(image.index)}
            onEdit={() => setEditImageIndex(image.index)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={batch.images}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onEdit={(index) => {
            setLightboxIndex(null);
            setEditImageIndex(index);
          }}
        />
      )}

      {editImage && (
        <EditDialog
          image={editImage}
          onClose={() => setEditImageIndex(null)}
        />
      )}
    </SectionCard>
  );
}
