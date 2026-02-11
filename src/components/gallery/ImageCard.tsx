"use client";

import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDuration } from "@/lib/format-utils";
import type { BatchImage } from "@/types/batch";
import { Loader2 } from "lucide-react";

interface ImageCardProps {
  image: BatchImage;
  onClick: () => void;
}

export function ImageCard({ image, onClick }: ImageCardProps) {
  return (
    <div
      onClick={image.status === "completed" ? onClick : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-card transition-all ${
        image.status === "completed"
          ? "border-border cursor-pointer hover:shadow-md hover:border-primary/50"
          : image.status === "processing"
            ? "border-primary animate-pulse-border"
            : image.status === "failed"
              ? "border-destructive/50"
              : "border-border"
      }`}
    >
      {/* Image or Placeholder */}
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {image.status === "completed" && image.result?.url ? (
          <img
            src={image.result.url}
            alt={image.rawPrompt}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : image.status === "processing" || image.status === "queued" ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : image.status === "failed" ? (
          <div className="flex h-full w-full items-center justify-center p-3">
            <p className="text-center text-xs text-destructive">{image.error || "שגיאה"}</p>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-2xl text-muted-foreground/30">{image.index + 1}</span>
          </div>
        )}
      </div>

      {/* Status Badge */}
      <div className="absolute top-1.5 left-1.5">
        <StatusBadge status={image.status} />
      </div>

      {/* Info Footer */}
      <div className="p-2">
        <p className="truncate text-xs text-foreground" title={image.rawPrompt}>
          {image.rawPrompt}
        </p>
        {image.durationMs && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatDuration(image.durationMs)}
            {image.result && ` | ${image.result.width}x${image.result.height}`}
          </p>
        )}
      </div>
    </div>
  );
}
