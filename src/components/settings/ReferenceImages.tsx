"use client";

import { useState, useCallback } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";

export function ReferenceImages() {
  const { state, dispatch } = useBatch();
  const [uploading, setUploading] = useState(false);
  const referenceUrls = state.settings.referenceImageUrls;

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      const newUrls: string[] = [...referenceUrls];

      for (const file of Array.from(files)) {
        try {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            newUrls.push(data.url);
          } else {
            toast.error(`העלאה נכשלה: ${file.name}`);
          }
        } catch {
          toast.error(`העלאה נכשלה: ${file.name}`);
        }
      }

      dispatch({ type: "SET_SETTINGS", settings: { referenceImageUrls: newUrls } });
      setUploading(false);
    },
    [referenceUrls, dispatch]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const newUrls = referenceUrls.filter((_, i) => i !== index);
      dispatch({ type: "SET_SETTINGS", settings: { referenceImageUrls: newUrls } });
    },
    [referenceUrls, dispatch]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">תמונות רפרנס</h3>
      <p className="text-[10px] text-muted-foreground">
        הוספת תמונות רפרנס תשתמש ב-endpoint לעריכת תמונות
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border p-4 hover:border-primary/50 transition-colors"
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.multiple = true;
          input.onchange = () => handleUpload(input.files);
          input.click();
        }}
      >
        {uploading ? (
          <span className="text-xs text-muted-foreground">מעלה...</span>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">גרור תמונות או לחץ להעלאה</span>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {referenceUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {referenceUrls.map((url, i) => (
            <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-md border border-border">
              <img src={url} alt={`ref ${i + 1}`} className="h-full w-full object-cover" />
              <button
                onClick={() => handleRemove(i)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
