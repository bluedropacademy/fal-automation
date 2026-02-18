"use client";

import { useState, useCallback } from "react";
import { Save, Loader2, LayoutGrid, X, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { usePresets } from "@/hooks/usePresets";
import type { Preset } from "@/types/preset";
import { PresetManagerModal } from "./PresetManagerModal";

export function PresetManager() {
  const { state, dispatch } = useBatch();
  const { presets, isSaving, isFetching, savePreset, loadPreset } = usePresets();
  const [showManager, setShowManager] = useState(false);
  const [showInlineSave, setShowInlineSave] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleLoad = useCallback(
    async (name: string) => {
      if (!name) return;
      const preset = await loadPreset(name);
      if (preset) {
        dispatch({ type: "LOAD_SETTINGS", settings: preset.settings, presetName: name });
        toast.success(`פריסט "${name}" נטען`);
      }
    },
    [loadPreset, dispatch]
  );

  const handleQuickSave = useCallback(async () => {
    if (state.activePresetName) {
      // Overwrite the active preset with current settings
      const now = new Date().toISOString();
      const existing = presets.find((p) => p.name === state.activePresetName);
      const preset: Preset = {
        name: state.activePresetName,
        description: existing?.description,
        settings: state.settings,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const ok = await savePreset(preset);
      if (ok) {
        toast.success(`פריסט "${state.activePresetName}" עודכן`);
        dispatch({ type: "SET_ACTIVE_PRESET", name: state.activePresetName });
      }
    } else {
      setShowInlineSave(true);
    }
  }, [state.activePresetName, state.settings, presets, savePreset, dispatch]);

  const handleSaveNew = useCallback(async () => {
    const name = presetName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const preset: Preset = {
      name,
      settings: state.settings,
      createdAt: now,
      updatedAt: now,
    };
    const ok = await savePreset(preset);
    if (ok) {
      toast.success(`פריסט "${name}" נשמר`);
      dispatch({ type: "SET_ACTIVE_PRESET", name });
    }
    setShowInlineSave(false);
    setPresetName("");
  }, [presetName, state.settings, savePreset, dispatch]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Active Preset Badge */}
      {state.activePresetName && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
          <Bookmark className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary truncate flex-1">
            {state.activePresetName}
          </span>
          {state.presetModified && (
            <span className="text-[11px] text-primary/60 shrink-0">(שונה)</span>
          )}
          <button
            onClick={() => dispatch({ type: "SET_ACTIVE_PRESET", name: null })}
            className="p-0.5 rounded text-primary/50 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Quick Load Dropdown */}
      <select
        value=""
        onChange={(e) => handleLoad(e.target.value)}
        disabled={isFetching}
        className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">-- טען פריסט --</option>
        {presets.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Action Buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={handleQuickSave}
          disabled={isSaving}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border/50 bg-muted px-2 py-2 text-xs font-medium hover:bg-muted/70 disabled:opacity-40 transition-colors"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {state.activePresetName ? "עדכן" : "שמור"}
        </button>
        <button
          onClick={() => setShowManager(true)}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border/50 bg-muted px-2 py-2 text-xs font-medium hover:bg-muted/70 transition-colors"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          ניהול
        </button>
      </div>

      {/* Inline Save (when no active preset) */}
      {showInlineSave && !state.activePresetName && (
        <div className="flex gap-1.5">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveNew();
              if (e.key === "Escape") {
                setShowInlineSave(false);
                setPresetName("");
              }
            }}
            autoFocus
            placeholder="שם הפריסט"
            className="input-base flex-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSaveNew}
            disabled={!presetName.trim() || isSaving}
            className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "שמור"}
          </button>
          <button
            onClick={() => {
              setShowInlineSave(false);
              setPresetName("");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-muted transition-colors"
          >
            ביטול
          </button>
        </div>
      )}

      {/* Full-Screen Manager Modal */}
      {showManager && <PresetManagerModal onClose={() => setShowManager(false)} />}
    </div>
  );
}
