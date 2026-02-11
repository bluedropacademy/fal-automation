"use client";

import { useState } from "react";
import Image from "next/image";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDuration } from "@/lib/format-utils";
import type { BatchImage } from "@/types/batch";
import { Loader2, Pencil, AlertCircle } from "lucide-react";

const PLACEHOLDER_BLUR =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=";

interface ImageCardProps {
  image: BatchImage;
  onClick: () => void;
  onEdit: () => void;
}

export function ImageCard({ image, onClick, onEdit }: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      onClick={image.status === "completed" ? onClick : undefined}
      className={`card-interactive group relative overflow-hidden rounded-xl border bg-card ${
        image.status === "completed"
          ? "border-border cursor-pointer hover:shadow-lg hover:border-primary/50"
          : image.status === "processing"
            ? "border-primary animate-pulse-border"
            : image.status === "failed"
              ? "border-destructive/50"
              : "border-border"
      }`}
    >
      {/* Image or Placeholder */}
      <div className="aspect-square w-full overflow-hidden bg-muted relative">
        {image.status === "completed" && image.result?.url ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted via-muted-foreground/10 to-muted" />
            )}
            <Image
              src={image.result.url}
              alt={image.rawPrompt}
              width={320}
              height={320}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
              className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
              placeholder="blur"
              blurDataURL={PLACEHOLDER_BLUR}
              onLoad={() => setLoaded(true)}
            />
          </>
        ) : image.status === "processing" || image.status === "queued" ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : image.status === "failed" ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-red-50 p-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive/60" />
            <p className="text-center text-xs font-medium text-destructive">
              {image.error || "שגיאה ביצירת התמונה"}
            </p>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3">
            <p className="text-center text-xs text-muted-foreground/60 line-clamp-3">
              {image.rawPrompt}
            </p>
          </div>
        )}
      </div>

      {/* Status Badge */}
      <div className="absolute top-1.5 left-1.5">
        <StatusBadge status={image.status} />
      </div>

      {/* Version Badge */}
      {(image.versionLabel || (image.versions && image.versions.length > 1)) && (
        <div className="absolute top-1.5 right-1.5">
          <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-white">
            {image.versionLabel
              ? image.versionLabel
              : `V${image.currentVersion ?? image.versions!.length}`}
          </span>
        </div>
      )}

      {/* Edit Button (on hover) */}
      {image.status === "completed" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute bottom-12 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
          title="ערוך תמונה"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Info Footer */}
      <div className="px-3 py-2.5">
        <p className="truncate text-sm text-foreground" title={image.rawPrompt}>
          {image.rawPrompt}
        </p>
        {image.durationMs && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDuration(image.durationMs)}
            {image.result && ` | ${image.result.width}x${image.result.height}`}
          </p>
        )}
      </div>
    </div>
  );
}
