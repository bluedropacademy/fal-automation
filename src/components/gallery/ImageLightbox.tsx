"use client";

import { useEffect, useCallback, useState } from "react";
import { X, ChevronRight, ChevronLeft, Download, Pencil, Loader2 } from "lucide-react";
import { formatDuration, proxyImageUrl } from "@/lib/format-utils";
import { useBatch } from "@/hooks/useBatch";
import type { BatchImage } from "@/types/batch";

interface ImageLightboxProps {
  images: BatchImage[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onEdit: (index: number) => void;
}

export function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onEdit,
}: ImageLightboxProps) {
  const { dispatch } = useBatch();
  // Track which URL is loaded to auto-reset when navigating
  const [loadedUrl, setLoadedUrl] = useState<string>("");
  const image = images.find((img) => img.index === currentIndex);
  const completedImages = images.filter((img) => img.status === "completed");
  const currentCompletedIdx = completedImages.findIndex((img) => img.index === currentIndex);
  const lightboxLoaded = loadedUrl === image?.result?.url;

  const goNext = useCallback(() => {
    if (currentCompletedIdx < completedImages.length - 1) {
      onNavigate(completedImages[currentCompletedIdx + 1].index);
    }
  }, [currentCompletedIdx, completedImages, onNavigate]);

  const goPrev = useCallback(() => {
    if (currentCompletedIdx > 0) {
      onNavigate(completedImages[currentCompletedIdx - 1].index);
    }
  }, [currentCompletedIdx, completedImages, onNavigate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goNext(); // RTL: left = next
      if (e.key === "ArrowRight") goPrev(); // RTL: right = prev
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  if (!image || image.status !== "completed" || !image.result) return null;

  const handleDownloadSingle = () => {
    const a = document.createElement("a");
    a.href = image.result!.url;
    const versionSuffix = image.versionLabel ? `-${image.versionLabel}` : "";
    a.download = `${String(image.index + 1).padStart(3, "0")}${versionSuffix}-image.png`;
    a.target = "_blank";
    a.click();
  };

  const versions = image.versions;
  const hasVersions = versions && versions.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Image with loading indicator */}
        <div className="relative">
          {!lightboxLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
          <img
            src={proxyImageUrl(image.result.url)}
            alt={image.rawPrompt}
            className={`max-h-[75vh] max-w-full rounded-lg object-contain transition-opacity duration-200 ${
              lightboxLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setLoadedUrl(image.result!.url)}
          />
        </div>

        {/* Navigation */}
        <div className="absolute inset-y-0 right-0 flex items-center">
          {currentCompletedIdx > 0 && (
            <button
              onClick={goPrev}
              className="mr-2 rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="absolute inset-y-0 left-0 flex items-center">
          {currentCompletedIdx < completedImages.length - 1 && (
            <button
              onClick={goNext}
              className="ml-2 rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Version Switcher */}
        {hasVersions && (
          <div className="mt-2 flex items-center gap-1">
            {versions.map((v) => (
              <button
                key={v.versionNumber}
                onClick={() =>
                  dispatch({
                    type: "SET_IMAGE_VERSION",
                    index: image.index,
                    versionNumber: v.versionNumber,
                  })
                }
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  (image.currentVersion ?? versions.length) === v.versionNumber
                    ? "bg-primary text-white"
                    : "bg-white/20 text-white/80 hover:bg-white/30"
                }`}
                title={v.versionNumber === 1 ? "מקור" : v.editPrompt}
              >
                V{v.versionNumber}
              </button>
            ))}
          </div>
        )}

        {/* Info bar */}
        <div className="mt-3 flex items-center gap-4 text-sm text-white/80 flex-wrap justify-center">
          <span dir="ltr">{image.rawPrompt}</span>
          <span>{image.result.width}x{image.result.height}</span>
          {image.durationMs && <span>{formatDuration(image.durationMs)}</span>}
          {image.seed !== undefined && <span>Seed: {image.seed}</span>}
          {image.versionLabel && (
            <span className="rounded-full bg-primary/80 px-2 py-0.5 text-xs font-bold text-white">
              {image.versionLabel}
            </span>
          )}
          <button
            onClick={handleDownloadSingle}
            className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30"
          >
            <Download className="h-3.5 w-3.5" />
            הורד
          </button>
          <button
            onClick={() => onEdit(image.index)}
            className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30"
          >
            <Pencil className="h-3.5 w-3.5" />
            ערוך
          </button>
        </div>
      </div>
    </div>
  );
}
