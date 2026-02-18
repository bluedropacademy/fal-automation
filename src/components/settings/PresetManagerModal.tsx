"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Plus,
  Search,
  Bookmark,
  Save,
  Trash2,
  Pencil,
  Download,
  Loader2,
  Calendar,
  PackageOpen,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useBatch } from "@/hooks/useBatch";
import { usePresets } from "@/hooks/usePresets";
import type { Preset } from "@/types/preset";
import type { GenerationSettings, Provider } from "@/types/generation";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  RESOLUTIONS,
  ASPECT_RATIOS,
  OUTPUT_FORMATS,
} from "@/lib/constants";

// --- Constants ---

const SAFETY_LABELS: Record<number, string> = {
  1: "מחמיר מאוד",
  2: "מחמיר",
  3: "מתון",
  4: "רגיל",
  5: "מתירני",
  6: "מתירני מאוד",
};

const PROVIDERS: Array<{ value: Provider; label: string }> = [
  { value: "fal", label: "Fal AI" },
  { value: "kie", label: "Kie AI" },
];

// --- Settings Preview Grid (read-only) ---

function SettingsPreview({ settings }: { settings: GenerationSettings }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "ספק", value: settings.provider === "kie" ? "Kie AI" : "Fal AI" },
    { label: "רזולוציה", value: settings.resolution },
    { label: "יחס תמונה", value: settings.aspectRatio === "auto" ? "אוטומטי" : settings.aspectRatio },
    { label: "פורמט", value: settings.outputFormat.toUpperCase() },
    { label: "מקביליות", value: settings.concurrency === 1 ? "סדרתי" : `×${settings.concurrency ?? 2}` },
  ];

  if (settings.provider !== "kie") {
    items.push(
      { label: "בטיחות", value: SAFETY_LABELS[settings.safetyTolerance] ?? String(settings.safetyTolerance) },
      { label: "תמונות לפרומפט", value: String(settings.numImages) },
      { label: "חיפוש ברשת", value: settings.enableWebSearch ? "כן" : "לא" },
    );
    if (settings.seed !== undefined) {
      items.push({ label: "סיד", value: String(settings.seed) });
    }
  }

  if (settings.promptPrefix) {
    items.push({ label: "תחילית", value: settings.promptPrefix.length > 30 ? settings.promptPrefix.slice(0, 30) + "…" : settings.promptPrefix });
  }
  if (settings.promptSuffix) {
    items.push({ label: "סיומת", value: settings.promptSuffix.length > 30 ? settings.promptSuffix.slice(0, 30) + "…" : settings.promptSuffix });
  }
  if (settings.referenceImageUrls?.length > 0) {
    items.push({ label: "תמונות רפרנס", value: String(settings.referenceImageUrls.length) });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{item.label}</p>
          <p className="text-sm font-medium text-foreground truncate">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// --- Inline Settings Editor (editable) ---

function SettingsEditor({
  settings,
  onChange,
}: {
  settings: GenerationSettings;
  onChange: (updated: GenerationSettings) => void;
}) {
  const update = (partial: Partial<GenerationSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const isFal = (settings.provider ?? "fal") !== "kie";
  const availableFormats = isFal
    ? OUTPUT_FORMATS
    : OUTPUT_FORMATS.filter((f) => f !== "webp");

  return (
    <div className="flex flex-col gap-4">
      {/* Provider */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">ספק AI</label>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                const u: Partial<GenerationSettings> = { provider: p.value };
                if (p.value === "kie") {
                  u.numImages = 1;
                  u.enableWebSearch = false;
                  u.seed = undefined;
                  if (settings.outputFormat === "webp") u.outputFormat = "png";
                }
                update(u);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                (settings.provider ?? "fal") === p.value
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">רזולוציה</label>
        <div className="grid grid-cols-3 gap-2">
          {RESOLUTIONS.map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => update({ resolution: res })}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                settings.resolution === res
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">יחס תמונה</label>
        <select
          value={settings.aspectRatio}
          onChange={(e) => update({ aspectRatio: e.target.value })}
          className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio === "auto" ? "אוטומטי" : ratio}
            </option>
          ))}
        </select>
      </div>

      {/* Output Format */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">פורמט</label>
        <div className={`grid gap-2 ${isFal ? "grid-cols-3" : "grid-cols-2"}`}>
          {availableFormats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => update({ outputFormat: fmt })}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase transition-all ${
                settings.outputFormat === fmt
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Concurrency */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">מקביליות</label>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ concurrency: n })}
              className={`rounded-lg px-2 py-2 text-xs font-bold transition-all ${
                (settings.concurrency ?? 2) === n
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              {n === 1 ? "סדרתי" : `×${n}`}
            </button>
          ))}
        </div>
      </div>

      {/* Fal-only settings */}
      {isFal && (
        <>
          {/* Safety Tolerance */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              רמת בטיחות: <span className="text-foreground font-semibold">{SAFETY_LABELS[settings.safetyTolerance]}</span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              value={settings.safetyTolerance}
              onChange={(e) => update({ safetyTolerance: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>מחמיר</span>
              <span>מתירני</span>
            </div>
          </div>

          {/* Num Images */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">תמונות לכל פרומפט</label>
            <select
              value={settings.numImages}
              onChange={(e) => update({ numImages: Number(e.target.value) })}
              className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Seed */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">סיד (אופציונלי)</label>
            <input
              type="number"
              value={settings.seed ?? ""}
              onChange={(e) => update({ seed: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="אקראי"
              className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Web Search */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableWebSearch}
              onChange={(e) => update({ enableWebSearch: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-xs font-medium text-muted-foreground">חיפוש ברשת</span>
          </label>
        </>
      )}

      {/* Prompt Prefix */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">תחילית פרומפט (אופציונלי)</label>
        <input
          type="text"
          value={settings.promptPrefix}
          onChange={(e) => update({ promptPrefix: e.target.value })}
          placeholder="טקסט שיתווסף לפני כל פרומפט..."
          className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Prompt Suffix */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">סיומת פרומפט (אופציונלי)</label>
        <input
          type="text"
          value={settings.promptSuffix}
          onChange={(e) => update({ promptSuffix: e.target.value })}
          placeholder="טקסט שיתווסף אחרי כל פרומפט..."
          className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

// --- Preset List Item ---

function PresetListItem({
  preset,
  isActive,
  isSelected,
  onClick,
}: {
  preset: Preset;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-right transition-all ${
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
          : "border-border hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground truncate flex-1">{preset.name}</span>
        {isActive && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
            פעיל
          </span>
        )}
      </div>
      {preset.description && (
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{preset.description}</p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        עודכן {new Date(preset.updatedAt).toLocaleDateString("he-IL")}
      </p>
    </button>
  );
}

// --- Create Form ---

function PresetCreateForm({
  currentSettings,
  isSaving,
  onSave,
  onCancel,
}: {
  currentSettings: GenerationSettings;
  isSaving: boolean;
  onSave: (name: string, description: string, settings: GenerationSettings) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editedSettings, setEditedSettings] = useState<GenerationSettings>(currentSettings);
  const [customizeSettings, setCustomizeSettings] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim(), editedSettings);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold text-foreground">פריסט חדש</h3>
        <p className="mt-1 text-sm text-muted-foreground">הפריסט יישמר עם ההגדרות הנוכחיות שלך</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !customizeSettings && handleSubmit()}
          autoFocus
          placeholder="שם הפריסט"
          className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור (אופציונלי)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="תיאור קצר של הפריסט..."
          className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      </div>

      {/* Settings section */}
      <div className="border-t border-border/60 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">הגדרות:</p>
          <button
            type="button"
            onClick={() => setCustomizeSettings(!customizeSettings)}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {customizeSettings ? "הסתר עריכה" : "התאם הגדרות"}
          </button>
        </div>
        {customizeSettings ? (
          <SettingsEditor settings={editedSettings} onChange={setEditedSettings} />
        ) : (
          <SettingsPreview settings={editedSettings} />
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isSaving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור פריסט
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

// --- Detail Panel ---

function PresetDetailPanel({
  preset,
  isActive,
  isSaving,
  isDeleting,
  onLoad,
  onSave,
  onDelete,
}: {
  preset: Preset;
  isActive: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onLoad: () => void;
  onSave: (updated: Preset) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(preset.name);
  const [editDescription, setEditDescription] = useState(preset.description ?? "");
  const [editedSettings, setEditedSettings] = useState<GenerationSettings>(preset.settings);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { state } = useBatch();

  // Reset edit state when preset changes
  useEffect(() => {
    setEditing(false);
    setEditName(preset.name);
    setEditDescription(preset.description ?? "");
    setEditedSettings(preset.settings);
  }, [preset.name, preset.description, preset.settings]);

  const handleStartEdit = () => {
    setEditing(true);
    setEditName(preset.name);
    setEditDescription(preset.description ?? "");
    setEditedSettings(preset.settings);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditName(preset.name);
    setEditDescription(preset.description ?? "");
    setEditedSettings(preset.settings);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    onSave({
      ...preset,
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      settings: editedSettings,
      updatedAt: new Date().toISOString(),
    });
    setEditing(false);
  };

  const handleUseCurrent = () => {
    setEditedSettings(state.settings);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">שם</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-bold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">תיאור</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  placeholder="תיאור (אופציונלי)..."
                  className="input-base w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-foreground">{preset.name}</h3>
                {isActive && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-600">
                    פעיל
                  </span>
                )}
              </div>
              {preset.description && (
                <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dates */}
      {!editing && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            נוצר: {new Date(preset.createdAt).toLocaleDateString("he-IL")}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            עודכן: {new Date(preset.updatedAt).toLocaleDateString("he-IL")}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        {editing ? (
          <>
            <button
              onClick={handleSaveEdit}
              disabled={!editName.trim() || isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              שמור שינויים
            </button>
            <button
              onClick={handleUseCurrent}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              החלף בהגדרות נוכחיות
            </button>
            <button
              onClick={handleCancelEdit}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              ביטול
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onLoad}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              טען פריסט
            </button>
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              ערוך
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              מחק
            </button>
          </>
        )}
      </div>

      {/* Settings Section */}
      <div className="border-t border-border/60 pt-4">
        <p className="text-sm font-medium text-muted-foreground mb-3">
          {editing ? "עריכת הגדרות:" : "הגדרות שמורות:"}
        </p>
        {editing ? (
          <SettingsEditor settings={editedSettings} onChange={setEditedSettings} />
        ) : (
          <SettingsPreview settings={preset.settings} />
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="מחיקת פריסט"
        message={`האם למחוק את הפריסט "${preset.name}"? פעולה זו לא ניתנת לביטול.`}
        confirmLabel="מחק"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// --- Main Modal ---

interface PresetManagerModalProps {
  onClose: () => void;
}

export function PresetManagerModal({ onClose }: PresetManagerModalProps) {
  const { state, dispatch } = useBatch();
  const { presets, isFetching, isSaving, isDeleting, savePreset, deletePreset, loadPreset } = usePresets();
  const [selectedPresetName, setSelectedPresetName] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Find the full preset object for the selected name
  const selectedPreset = presets.find((p) => p.name === selectedPresetName) ?? null;

  // Filter presets by search
  const filteredPresets = presets.filter(
    (p) =>
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Handlers ---

  const handleLoad = useCallback(
    async (name: string) => {
      const preset = await loadPreset(name);
      if (preset) {
        dispatch({ type: "LOAD_SETTINGS", settings: preset.settings, presetName: name });
        toast.success(`פריסט "${name}" נטען`);
      }
    },
    [loadPreset, dispatch]
  );

  const handleCreate = useCallback(
    async (name: string, description: string, settings: GenerationSettings) => {
      const now = new Date().toISOString();
      const preset: Preset = {
        name,
        description: description || undefined,
        settings,
        createdAt: now,
        updatedAt: now,
      };
      const ok = await savePreset(preset);
      if (ok) {
        toast.success(`פריסט "${name}" נוצר`);
        dispatch({ type: "SET_ACTIVE_PRESET", name });
        setShowCreateForm(false);
        setSelectedPresetName(name);
      }
    },
    [savePreset, dispatch]
  );

  const handleSaveEdit = useCallback(
    async (updated: Preset) => {
      const originalName = selectedPreset?.name;
      const nameChanged = originalName && originalName !== updated.name;

      // If name changed, delete the old one first
      if (nameChanged) {
        const delOk = await deletePreset(originalName);
        if (!delOk) return;
      }

      const ok = await savePreset(updated);
      if (ok) {
        toast.success(`פריסט "${updated.name}" עודכן`);
        // Update active preset name if it was renamed
        if (nameChanged && state.activePresetName === originalName) {
          dispatch({ type: "SET_ACTIVE_PRESET", name: updated.name });
        }
        setSelectedPresetName(updated.name);
      }
    },
    [selectedPreset, savePreset, deletePreset, state.activePresetName, dispatch]
  );

  const handleDelete = useCallback(async () => {
    if (!selectedPresetName) return;
    const ok = await deletePreset(selectedPresetName);
    if (ok) {
      toast.success(`פריסט "${selectedPresetName}" נמחק`);
      if (state.activePresetName === selectedPresetName) {
        dispatch({ type: "SET_ACTIVE_PRESET", name: null });
      }
      setSelectedPresetName(null);
    }
  }, [selectedPresetName, deletePreset, state.activePresetName, dispatch]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="animate-modal-in flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl overflow-hidden"
        style={{ maxHeight: "min(90vh, 800px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
              <Bookmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">ניהול פריסטים</h2>
              <p className="text-xs text-muted-foreground">{presets.length} פריסטים</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowCreateForm(true);
                setSelectedPresetName(null);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              פריסט חדש
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Preset List (right side in RTL) */}
          <div className="w-64 shrink-0 border-e border-border/60 overflow-y-auto p-4 flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש..."
                className="input-base w-full rounded-lg border border-border bg-white pr-9 pl-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* List */}
            {isFetching && presets.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPresets.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                {searchQuery ? "לא נמצאו פריסטים" : "אין פריסטים"}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredPresets.map((preset) => (
                  <PresetListItem
                    key={preset.name}
                    preset={preset}
                    isActive={state.activePresetName === preset.name}
                    isSelected={selectedPresetName === preset.name}
                    onClick={() => {
                      setSelectedPresetName(preset.name);
                      setShowCreateForm(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {showCreateForm ? (
              <PresetCreateForm
                currentSettings={state.settings}
                isSaving={isSaving}
                onSave={handleCreate}
                onCancel={() => setShowCreateForm(false)}
              />
            ) : selectedPreset ? (
              <PresetDetailPanel
                key={selectedPreset.name}
                preset={selectedPreset}
                isActive={state.activePresetName === selectedPreset.name}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onLoad={() => handleLoad(selectedPreset.name)}
                onSave={handleSaveEdit}
                onDelete={handleDelete}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
                  <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {presets.length === 0 ? "אין פריסטים עדיין" : "בחר פריסט מהרשימה"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {presets.length === 0
                    ? "צור את הפריסט הראשון שלך כדי לשמור הגדרות"
                    : "או צור פריסט חדש"}
                </p>
                {presets.length === 0 && (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    צור פריסט ראשון
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
