"use client";

import { useState, useCallback } from "react";
import { X, Loader2, Pencil, Copy, Layers } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { uid } from "@/lib/format-utils";
import type { BatchImage, EditMode, ImageVersion } from "@/types/batch";

interface EditDialogProps {
  image: BatchImage;
  onClose: () => void;
}

const EDIT_MODES: { value: EditMode; label: string; description: string; icon: typeof Pencil }[] = [
  {
    value: "replace",
    label: "עריכת החלפה",
    description: "התמונה הערוכה מחליפה את המקורית, עם אפשרות לעבור בין גרסאות",
    icon: Pencil,
  },
  {
    value: "duplicate",
    label: "שכפול",
    description: "יצירת תמונה חדשה מהעריכה, המקורית נשמרת",
    icon: Copy,
  },
  {
    value: "parallel",
    label: "עריכה מקבילה",
    description: "יצירת מספר וריאציות בו-זמנית עם משתנים",
    icon: Layers,
  },
];

export function EditDialog({ image, onClose }: EditDialogProps) {
  const { state, dispatch } = useBatch();
  const { settings } = state;
  const batch = state.currentBatch;

  const [editMode, setEditMode] = useState<EditMode>("replace");
  const [prompt, setPrompt] = useState("");
  const [variableValues, setVariableValues] = useState("");
  const [loading, setLoading] = useState(false);

  const imageUrl = image.result?.url;
  if (!imageUrl) return null;

  const getNextVersionNumber = useCallback(() => {
    if (!batch) return 2;
    // For replace: check existing versions on this image
    const existingVersions = image.versions?.length ?? 0;
    return existingVersions > 0 ? existingVersions + 1 : 2;
  }, [batch, image]);

  const getNextImageIndex = useCallback(() => {
    if (!batch) return 0;
    return batch.images.length;
  }, [batch]);

  const getVersionLabel = useCallback((baseIndex: number) => {
    if (!batch) return "V2";
    // Count existing images that are edits of the same source
    const sourceIdx = image.sourceImageIndex ?? image.index;
    const existingEdits = batch.images.filter(
      (img) => img.sourceImageIndex === sourceIdx || img.index === sourceIdx
    );
    return `V${existingEdits.length + baseIndex + 1}`;
  }, [batch, image]);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("נא להזין פרומפט לעריכה");
      return;
    }

    setLoading(true);

    try {
      if (editMode === "parallel") {
        await handleParallelEdit();
      } else {
        await handleSingleEdit();
      }
      onClose();
    } catch (error) {
      toast.error("שגיאה בעריכה", {
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSingleEdit = async () => {
    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        prompt: prompt.trim(),
        settings: {
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          outputFormat: settings.outputFormat,
          safetyTolerance: settings.safetyTolerance,
          enableWebSearch: settings.enableWebSearch,
          seed: settings.seed,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Edit failed");
    }

    const data = await res.json();

    if (editMode === "replace") {
      const versionNum = getNextVersionNumber();
      const newVersion: ImageVersion = {
        versionNumber: versionNum,
        url: data.image.url,
        contentType: data.image.contentType,
        width: data.image.width,
        height: data.image.height,
        editPrompt: prompt.trim(),
        createdAt: new Date().toISOString(),
      };

      dispatch({
        type: "REPLACE_IMAGE_VERSION",
        index: image.index,
        newVersion,
        newResult: data.image,
      });

      toast.success(`עריכה הושלמה — V${versionNum}`);
    } else {
      // Duplicate mode
      const newIndex = getNextImageIndex();
      const vLabel = getVersionLabel(0);
      const newImage: BatchImage = {
        id: uid(),
        index: newIndex,
        rawPrompt: `[${vLabel}] ${prompt.trim()}`,
        fullPrompt: prompt.trim(),
        status: "completed",
        result: data.image,
        seed: data.seed,
        requestId: data.requestId,
        completedAt: new Date().toISOString(),
        sourceImageIndex: image.sourceImageIndex ?? image.index,
        versionLabel: vLabel,
      };

      dispatch({ type: "ADD_IMAGES", images: [newImage] });
      toast.success(`שכפול הושלם — ${vLabel}`);
    }
  };

  const handleParallelEdit = async () => {
    const values = variableValues
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (values.length === 0) {
      throw new Error("נא להזין לפחות ערך אחד למשתנה");
    }

    // Check if prompt has [X] placeholder
    const hasPlaceholder = /\[.+?\]/.test(prompt);

    const variations = values.map((value) => {
      let finalPrompt: string;
      if (hasPlaceholder) {
        // Replace all [...] placeholders with the value
        finalPrompt = prompt.replace(/\[.+?\]/g, value);
      } else {
        // Append value to prompt
        finalPrompt = `${prompt.trim()} ${value}`;
      }
      return {
        prompt: finalPrompt,
        label: value,
      };
    });

    toast.info(`מייצר ${variations.length} וריאציות...`);

    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        variations,
        settings: {
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          outputFormat: settings.outputFormat,
          safetyTolerance: settings.safetyTolerance,
          enableWebSearch: settings.enableWebSearch,
          seed: settings.seed,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Parallel edit failed");
    }

    const data = await res.json();
    const baseIndex = getNextImageIndex();

    const newImages: BatchImage[] = data.results.map(
      (result: { label: string; prompt: string; image: BatchImage["result"]; seed?: number; requestId?: string }, i: number) => {
        const vLabel = getVersionLabel(i);
        return {
          id: uid(),
          index: baseIndex + i,
          rawPrompt: `[${vLabel}] ${result.prompt}`,
          fullPrompt: result.prompt,
          status: "completed" as const,
          result: result.image,
          seed: result.seed,
          requestId: result.requestId,
          completedAt: new Date().toISOString(),
          sourceImageIndex: image.sourceImageIndex ?? image.index,
          versionLabel: vLabel,
        };
      }
    );

    if (newImages.length > 0) {
      dispatch({ type: "ADD_IMAGES", images: newImages });
    }

    const successCount = data.results.length;
    const errorCount = data.errors?.length ?? 0;

    if (errorCount > 0) {
      toast.warning(`${successCount} וריאציות הושלמו, ${errorCount} נכשלו`);
    } else {
      toast.success(`${successCount} וריאציות נוצרו בהצלחה!`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-modal-in relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">עריכת תמונה</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="mb-4 flex justify-center">
          <img
            src={imageUrl}
            alt={image.rawPrompt}
            className="max-h-40 rounded-lg object-contain border border-border"
          />
        </div>

        {/* Edit Mode Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            מצב עריכה
          </label>
          <div className="flex flex-col gap-2">
            {EDIT_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.value}
                  onClick={() => setEditMode(mode.value)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-right transition-colors ${
                    editMode === mode.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-gray-300"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 mt-0.5 shrink-0 ${
                      editMode === mode.value ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium">{mode.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {mode.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prompt Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">
            פרומפט עריכה
          </label>
          <textarea
            dir="ltr"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              editMode === "parallel"
                ? "make him [X]"
                : "make him smile"
            }
            rows={2}
            className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
          />
          {editMode === "parallel" && (
            <p className="mt-1 text-xs text-muted-foreground">
              השתמש ב-[X] כמשתנה שיוחלף בכל ערך מהרשימה למטה
            </p>
          )}
        </div>

        {/* Variable Values (Parallel mode only) */}
        {editMode === "parallel" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-1">
              ערכים למשתנה (שורה אחת = וריאציה אחת)
            </label>
            <textarea
              dir="ltr"
              value={variableValues}
              onChange={(e) => setVariableValues(e.target.value)}
              placeholder={"happy\nsad\ntired\nexcited"}
              rows={4}
              className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {variableValues.split("\n").filter((v) => v.trim()).length} וריאציות
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={loading || !prompt.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מעבד...
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" />
                {editMode === "parallel"
                  ? `ערוך ${variableValues.split("\n").filter((v) => v.trim()).length} וריאציות`
                  : editMode === "replace"
                    ? "ערוך והחלף"
                    : "ערוך ושכפל"}
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
