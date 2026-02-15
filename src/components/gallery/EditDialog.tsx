"use client";

import { useState, useCallback } from "react";
import { X, Pencil, Copy, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { uid, proxyImageUrl } from "@/lib/format-utils";
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
  const { state, dispatch, flushSave } = useBatch();
  const { settings } = state;
  const batch = state.currentBatch;

  const [editMode, setEditMode] = useState<EditMode>("replace");
  const [prompt, setPrompt] = useState("");
  const [variableValues, setVariableValues] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const imageUrl = image.result?.url;
  if (!imageUrl) return null;

  const getNextVersionNumber = useCallback(() => {
    if (!batch) return 2;
    const existingVersions = image.versions?.length ?? 0;
    return existingVersions > 0 ? existingVersions + 1 : 2;
  }, [batch, image]);

  const getNextImageIndex = useCallback(() => {
    if (!batch) return 0;
    return batch.images.length;
  }, [batch]);

  const getVersionLabel = useCallback((baseIndex: number) => {
    if (!batch) return "V2";
    const sourceIdx = image.sourceImageIndex ?? image.index;
    const existingEdits = batch.images.filter(
      (img) => img.sourceImageIndex === sourceIdx || img.index === sourceIdx
    );
    return `V${existingEdits.length + baseIndex + 1}`;
  }, [batch, image]);

  const buildRequestBody = (editPrompt: string, variations?: { prompt: string; label: string }[]) => ({
    imageUrl,
    ...(variations ? { variations } : { prompt: editPrompt }),
    provider: settings.provider ?? "fal",
    settings: {
      resolution: settings.resolution,
      aspectRatio: settings.aspectRatio,
      outputFormat: settings.outputFormat,
      safetyTolerance: settings.safetyTolerance,
      enableWebSearch: settings.enableWebSearch,
      seed: settings.seed,
    },
  });

  const handleSubmit = () => {
    if (!prompt.trim()) {
      toast.error("נא להזין פרומפט לעריכה");
      return;
    }

    if (editMode === "replace") {
      fireReplaceEdit();
    } else if (editMode === "duplicate") {
      fireDuplicateEdit();
    } else {
      fireParallelEdit();
    }
  };

  const fireReplaceEdit = async () => {
    const capturedPrompt = prompt.trim();
    const capturedIndex = image.index;
    const versionNum = getNextVersionNumber();

    setIsSubmitting(true);
    dispatch({ type: "UPDATE_IMAGE", index: capturedIndex, update: { status: "editing" } });

    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(capturedPrompt)),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Edit failed");
      }

      const data = await res.json();

      const newVersion: ImageVersion = {
        versionNumber: versionNum,
        url: data.image.url,
        contentType: data.image.contentType,
        width: data.image.width,
        height: data.image.height,
        editPrompt: capturedPrompt,
        createdAt: new Date().toISOString(),
      };

      dispatch({
        type: "REPLACE_IMAGE_VERSION",
        index: capturedIndex,
        newVersion,
        newResult: data.image,
      });

      // Force immediate save — don't rely on debounce for version data
      requestAnimationFrame(() => flushSave());

      toast.success(`עריכה הושלמה — V${versionNum}`);
      onClose();
    } catch (error) {
      dispatch({ type: "UPDATE_IMAGE", index: capturedIndex, update: { status: "completed" } });
      toast.error("שגיאה בעריכה", {
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
      setIsSubmitting(false);
    }
  };

  const fireDuplicateEdit = () => {
    // Capture values and create placeholder
    const capturedPrompt = prompt.trim();
    const newIndex = getNextImageIndex();
    const vLabel = getVersionLabel(0);
    const placeholderId = uid();

    const placeholder: BatchImage = {
      id: placeholderId,
      index: newIndex,
      rawPrompt: `[${vLabel}] ${capturedPrompt}`,
      fullPrompt: capturedPrompt,
      status: "processing",
      sourceImageIndex: image.sourceImageIndex ?? image.index,
      versionLabel: vLabel,
    };

    dispatch({ type: "ADD_IMAGES", images: [placeholder] });
    onClose();

    // Fire-and-forget
    fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(capturedPrompt)),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Edit failed");
        }
        return res.json();
      })
      .then((data) => {
        dispatch({
          type: "UPDATE_IMAGE",
          index: newIndex,
          update: {
            status: "completed",
            result: data.image,
            seed: data.seed,
            requestId: data.requestId,
            completedAt: new Date().toISOString(),
          },
        });
        toast.success(`שכפול הושלם — ${vLabel}`);
      })
      .catch((error) => {
        dispatch({
          type: "UPDATE_IMAGE",
          index: newIndex,
          update: { status: "failed", error: error instanceof Error ? error.message : "שגיאה לא ידועה" },
        });
        toast.error("שגיאה בשכפול", {
          description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        });
      });
  };

  const fireParallelEdit = () => {
    const values = variableValues
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (values.length === 0) {
      toast.error("נא להזין לפחות ערך אחד למשתנה");
      return;
    }

    const hasPlaceholder = /\[.+?\]/.test(prompt);
    const variations = values.map((value) => {
      const finalPrompt = hasPlaceholder
        ? prompt.replace(/\[.+?\]/g, value)
        : `${prompt.trim()} ${value}`;
      return { prompt: finalPrompt, label: value };
    });

    // Create placeholder images
    const baseIndex = getNextImageIndex();
    const placeholders: BatchImage[] = variations.map((v, i) => {
      const vLabel = getVersionLabel(i);
      return {
        id: uid(),
        index: baseIndex + i,
        rawPrompt: `[${vLabel}] ${v.prompt}`,
        fullPrompt: v.prompt,
        status: "processing" as const,
        sourceImageIndex: image.sourceImageIndex ?? image.index,
        versionLabel: vLabel,
      };
    });

    dispatch({ type: "ADD_IMAGES", images: placeholders });
    onClose();
    toast.info(`מייצר ${variations.length} וריאציות...`);

    // Fire-and-forget
    fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(prompt.trim(), variations)),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Parallel edit failed");
        }
        return res.json();
      })
      .then((data) => {
        // Update each placeholder with the result
        data.results.forEach(
          (result: { label: string; prompt: string; image: BatchImage["result"]; seed?: number; requestId?: string }, i: number) => {
            dispatch({
              type: "UPDATE_IMAGE",
              index: baseIndex + i,
              update: {
                status: "completed",
                result: result.image,
                seed: result.seed,
                requestId: result.requestId,
                completedAt: new Date().toISOString(),
              },
            });
          }
        );

        const successCount = data.results.length;
        const errorCount = data.errors?.length ?? 0;

        if (errorCount > 0) {
          toast.warning(`${successCount} וריאציות הושלמו, ${errorCount} נכשלו`);
        } else {
          toast.success(`${successCount} וריאציות נוצרו בהצלחה!`);
        }
      })
      .catch((error) => {
        // Mark all placeholders as failed
        placeholders.forEach((_, i) => {
          dispatch({
            type: "UPDATE_IMAGE",
            index: baseIndex + i,
            update: { status: "failed", error: error instanceof Error ? error.message : "שגיאה לא ידועה" },
          });
        });
        toast.error("שגיאה בעריכה מקבילה", {
          description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        });
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={isSubmitting ? undefined : onClose}
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
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="mb-4 flex justify-center">
          <img
            src={proxyImageUrl(imageUrl)}
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
            disabled={!prompt.trim() || isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            {isSubmitting
              ? "מעבד עריכה..."
              : editMode === "parallel"
                ? `ערוך ${variableValues.split("\n").filter((v) => v.trim()).length} וריאציות`
                : editMode === "replace"
                  ? "ערוך והחלף"
                  : "ערוך ושכפל"}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
