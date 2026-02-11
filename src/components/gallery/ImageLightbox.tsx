"use client";

import { useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Download } from "lucide-react";
import { formatDuration } from "@/lib/format-utils";
import type { BatchImage } from "@/types/batch";

interface ImageLightboxProps {
  images: BatchImage[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  const image = images[currentIndex];
  const completedImages = images.filter((img) => img.status === "completed");
  const currentCompletedIdx = completedImages.findIndex((img) => img.index === currentIndex);

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
    a.download = `${String(image.index + 1).padStart(3, "0")}-image.png`;
    a.target = "_blank";
    a.click();
  };

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
          className="absolute -top-10 left-0 text-white hover:text-gray-300"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Image */}
        <img
          src={image.result.url}
          alt={image.rawPrompt}
          className="max-h-[75vh] max-w-full rounded-lg object-contain"
        />

        {/* Navigation */}
        <div className="absolute inset-y-0 right-0 flex items-center">
          {currentCompletedIdx > 0 && (
            <button
              onClick={goPrev}
              className="mr-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="absolute inset-y-0 left-0 flex items-center">
          {currentCompletedIdx < completedImages.length - 1 && (
            <button
              onClick={goNext}
              className="ml-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Info bar */}
        <div className="mt-3 flex items-center gap-4 text-sm text-white/80">
          <span dir="ltr">{image.rawPrompt}</span>
          <span>{image.result.width}x{image.result.height}</span>
          {image.durationMs && <span>{formatDuration(image.durationMs)}</span>}
          {image.seed !== undefined && <span>Seed: {image.seed}</span>}
          <button
            onClick={handleDownloadSingle}
            className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30"
          >
            <Download className="h-3.5 w-3.5" />
            הורד
          </button>
        </div>
      </div>
    </div>
  );
}
