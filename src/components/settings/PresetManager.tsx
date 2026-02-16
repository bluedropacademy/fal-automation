"use client";

import { useState, useCallback } from "react";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { usePresets } from "@/hooks/usePresets";
import type { Preset } from "@/types/preset";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

export function PresetManager() {
  const { state, dispatch } = useBatch();
  const { presets, savePreset, deletePreset, loadPreset } = usePresets();
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleLoad = useCallback(
    async (name: string) => {
      setSelectedPreset(name);
      if (!name) return;
      const preset = await loadPreset(name);
      if (preset) {
        dispatch({ type: "LOAD_SETTINGS", settings: preset.settings });
        toast.success(`פריסט "${name}" נטען`);
      }
    },
    [loadPreset, dispatch]
  );

  const handleSave = useCallback(async () => {
    if (!presetName.trim()) return;
    const preset: Preset = {
      name: presetName.trim(),
      settings: state.settings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ok = await savePreset(preset);
    if (ok) {
      toast.success(`פריסט "${presetName}" נשמר`);
      setSelectedPreset(presetName);
    }
    setShowSaveDialog(false);
    setPresetName("");
  }, [presetName, state.settings, savePreset]);

  const handleDelete = useCallback(async () => {
    if (!selectedPreset) return;
    const ok = await deletePreset(selectedPreset);
    if (ok) {
      toast.success(`פריסט "${selectedPreset}" נמחק`);
      setSelectedPreset("");
    }
    setShowDeleteDialog(false);
  }, [selectedPreset, deletePreset]);

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectedPreset}
        onChange={(e) => handleLoad(e.target.value)}
        className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">-- בחר פריסט --</option>
        {presets.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="flex gap-1.5">
        <button
          onClick={() => {
            setPresetName("");
            setShowSaveDialog(true);
          }}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border/50 bg-muted px-2 py-2 text-xs font-medium hover:bg-muted/70 transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          שמור
        </button>
        <button
          onClick={() => setShowDeleteDialog(true)}
          disabled={!selectedPreset}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border/50 bg-muted px-2 py-2 text-xs font-medium hover:bg-muted/70 disabled:opacity-40 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          מחק
        </button>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="animate-modal-in w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">שמור פריסט</h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="שם הפריסט"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="input-base mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleSave}
                disabled={!presetName.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                שמור
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        title="מחיקת פריסט"
        message={`האם למחוק את הפריסט "${selectedPreset}"?`}
        confirmLabel="מחק"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
