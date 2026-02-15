"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, Download, ImageIcon, Video, X } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { useBatch } from "@/hooks/useBatch";
import { sanitizeFilename } from "@/lib/format-utils";
import { SectionCard } from "@/components/common/SectionCard";
import { ImageCard } from "./ImageCard";
import { ImageLightbox } from "./ImageLightbox";
import { EditDialog } from "./EditDialog";
import { VideoDialog } from "./VideoDialog";

export function ImageGallery() {
  const { state } = useBatch();
  const batch = state.currentBatch;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editImageIndex, setEditImageIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  const completedImages = batch?.images.filter((img) => img.status === "completed") ?? [];

  // Close download menu on outside click
  useEffect(() => {
    if (!downloadMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [downloadMenuOpen]);

  const toggleSelect = useCallback((imageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(completedImages.map((img) => img.id)));
  }, [completedImages]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const selectedImages = completedImages.filter((img) => selectedIds.has(img.id));

  const handleDownloadAll = useCallback(async (naming: "sequential" | "prompt") => {
    if (!batch || completedImages.length === 0) return;

    setDownloadMenuOpen(false);
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

            let filename: string;
            if (naming === "prompt") {
              const promptName = sanitizeFilename(img.rawPrompt);
              filename = `${promptName}${versionSuffix}.${ext}`;
            } else {
              filename = `${idx}${versionSuffix}.${ext}`;
            }

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
          <div className="flex items-center gap-2">
            {!selectionMode ? (
              <button
                onClick={() => setSelectionMode(true)}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-200 transition-colors"
              >
                <Video className="h-3.5 w-3.5" />
                בחר לוידאו
              </button>
            ) : (
              <button
                onClick={clearSelection}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                ביטול בחירה
              </button>
            )}
            <div className="relative" ref={downloadMenuRef}>
              <button
                onClick={() => setDownloadMenuOpen((v) => !v)}
                disabled={downloading}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading
                  ? "מוריד..."
                  : `הורד הכל (${completedImages.length})`}
                <ChevronDown className="h-3 w-3" />
              </button>
              {downloadMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-lg py-1">
                  <button
                    onClick={() => handleDownloadAll("sequential")}
                    className="w-full px-3 py-2 text-right text-xs hover:bg-muted transition-colors"
                  >
                    מספור (001, 002...)
                  </button>
                  <button
                    onClick={() => handleDownloadAll("prompt")}
                    className="w-full px-3 py-2 text-right text-xs hover:bg-muted transition-colors"
                  >
                    לפי שם הפרומפט
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {batch.images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            onClick={() => {
              if (selectionMode && image.status === "completed") {
                toggleSelect(image.id);
              } else {
                setLightboxIndex(image.index);
              }
            }}
            onEdit={() => setEditImageIndex(image.index)}
            selectable={selectionMode}
            selected={selectedIds.has(image.id)}
            onToggleSelect={() => toggleSelect(image.id)}
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

      {/* Floating Selection Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl bg-card border border-border shadow-2xl px-5 py-3">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} תמונות נבחרו
          </span>
          <button
            onClick={selectAll}
            className="text-xs text-primary hover:underline"
          >
            בחר הכל ({completedImages.length})
          </button>
          <div className="h-5 w-px bg-border" />
          <button
            onClick={() => setVideoDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Video className="h-4 w-4" />
            צור וידאו
          </button>
          <button
            onClick={clearSelection}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Video Generation Dialog */}
      {videoDialogOpen && (
        <VideoDialog
          images={selectedImages}
          onClose={() => {
            setVideoDialogOpen(false);
            clearSelection();
          }}
        />
      )}
    </SectionCard>
  );
}
