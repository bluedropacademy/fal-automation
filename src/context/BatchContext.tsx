"use client";

import { createContext, useContext, useReducer, useEffect, useRef, useState, type ReactNode } from "react";
import type { Batch, BatchImage, BatchStatus, ImageVersion } from "@/types/batch";
import type { GenerationSettings } from "@/types/generation";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  saveCurrentBatch,
  loadCurrentBatch,
  clearCurrentBatch,
  archiveBatch,
  saveTerminalBatch,
  saveBatchToHistory,
  saveSettings,
  loadSettings,
  saveActivePreset,
  loadActivePreset,
  loadActiveQStashBatchId,
} from "@/lib/persistence";

interface BatchState {
  prompts: string[];
  settings: GenerationSettings;
  batchName: string;
  currentBatch: Batch | null;
  savedBatch: Batch | null;
  viewingHistory: boolean;
  activePresetName: string | null;
  presetModified: boolean;
  /** Set during hydration if a QStash batch was running when browser closed */
  pendingQStashBatchId: string | null;
}

type BatchAction =
  | { type: "SET_PROMPTS"; prompts: string[] }
  | { type: "SET_BATCH_NAME"; name: string }
  | { type: "SET_SETTINGS"; settings: Partial<GenerationSettings> }
  | { type: "LOAD_SETTINGS"; settings: GenerationSettings; presetName?: string }
  | { type: "SET_ACTIVE_PRESET"; name: string | null }
  | { type: "START_BATCH"; batch: Batch }
  | { type: "UPDATE_IMAGE"; index: number; update: Partial<BatchImage> }
  | { type: "SET_BATCH_STATUS"; status: BatchStatus }
  | { type: "RESET_BATCH" }
  | { type: "REPLACE_IMAGE_VERSION"; index: number; newVersion: ImageVersion; newResult: BatchImage["result"] }
  | { type: "ADD_IMAGES"; images: BatchImage[] }
  | { type: "SET_IMAGE_VERSION"; index: number; versionNumber: number }
  | { type: "VIEW_HISTORY_BATCH"; batch: Batch }
  | { type: "BACK_TO_CURRENT" }
  | { type: "HYDRATE"; currentBatch: Batch | null; settings?: GenerationSettings; activePresetName?: string | null; pendingQStashBatchId?: string | null }
  | { type: "CLEAR_QSTASH_RECONNECT" };

function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case "SET_PROMPTS":
      return { ...state, prompts: action.prompts };

    case "SET_BATCH_NAME":
      return { ...state, batchName: action.name };

    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.settings }, presetModified: state.activePresetName !== null };

    case "LOAD_SETTINGS":
      return {
        ...state,
        settings: { ...DEFAULT_SETTINGS, ...action.settings },
        activePresetName: action.presetName ?? state.activePresetName,
        presetModified: false,
      };

    case "SET_ACTIVE_PRESET":
      return { ...state, activePresetName: action.name, presetModified: false };

    case "START_BATCH":
      return { ...state, currentBatch: action.batch };

    case "UPDATE_IMAGE": {
      if (!state.currentBatch) return state;
      const images = [...state.currentBatch.images];
      images[action.index] = { ...images[action.index], ...action.update };
      return {
        ...state,
        currentBatch: { ...state.currentBatch, images },
      };
    }

    case "SET_BATCH_STATUS": {
      if (!state.currentBatch) return state;
      return {
        ...state,
        currentBatch: {
          ...state.currentBatch,
          status: action.status,
          ...(action.status === "completed" || action.status === "cancelled"
            ? { completedAt: new Date().toISOString() }
            : {}),
        },
      };
    }

    case "RESET_BATCH":
      return { ...state, currentBatch: null };

    case "REPLACE_IMAGE_VERSION": {
      if (!state.currentBatch) return state;
      const images = [...state.currentBatch.images];
      const img = images[action.index];
      // Save original as V1 if no versions yet
      const existingVersions = img.versions ?? [];
      if (existingVersions.length === 0 && img.result) {
        existingVersions.push({
          versionNumber: 1,
          url: img.result.url,
          contentType: img.result.contentType,
          width: img.result.width,
          height: img.result.height,
          editPrompt: img.rawPrompt,
          createdAt: img.completedAt ?? new Date().toISOString(),
        });
      }
      const newVersions = [...existingVersions, action.newVersion];
      images[action.index] = {
        ...img,
        result: action.newResult,
        versions: newVersions,
        currentVersion: action.newVersion.versionNumber,
        status: "completed",
      };
      return {
        ...state,
        currentBatch: { ...state.currentBatch, images },
      };
    }

    case "ADD_IMAGES": {
      if (!state.currentBatch) return state;
      return {
        ...state,
        currentBatch: {
          ...state.currentBatch,
          images: [...state.currentBatch.images, ...action.images],
        },
      };
    }

    case "SET_IMAGE_VERSION": {
      if (!state.currentBatch) return state;
      const images = [...state.currentBatch.images];
      const img = images[action.index];
      if (!img.versions) return state;
      const version = img.versions.find((v) => v.versionNumber === action.versionNumber);
      if (!version) return state;
      images[action.index] = {
        ...img,
        currentVersion: action.versionNumber,
        result: {
          url: version.url,
          contentType: version.contentType,
          width: version.width,
          height: version.height,
        },
      };
      return {
        ...state,
        currentBatch: { ...state.currentBatch, images },
      };
    }

    case "VIEW_HISTORY_BATCH":
      return {
        ...state,
        savedBatch: state.viewingHistory ? state.savedBatch : state.currentBatch,
        currentBatch: action.batch,
        viewingHistory: true,
      };

    case "BACK_TO_CURRENT":
      return {
        ...state,
        currentBatch: state.savedBatch,
        savedBatch: null,
        viewingHistory: false,
      };

    case "HYDRATE":
      return {
        ...state,
        currentBatch: action.currentBatch,
        ...(action.settings ? { settings: action.settings } : {}),
        ...(action.activePresetName !== undefined ? { activePresetName: action.activePresetName } : {}),
        pendingQStashBatchId: action.pendingQStashBatchId ?? null,
      };

    case "CLEAR_QSTASH_RECONNECT":
      return { ...state, pendingQStashBatchId: null };

    default:
      return state;
  }
}

const initialState: BatchState = {
  prompts: [],
  settings: DEFAULT_SETTINGS,
  batchName: "",
  currentBatch: null,
  savedBatch: null,
  viewingHistory: false,
  activePresetName: null,
  presetModified: false,
  pendingQStashBatchId: null,
};

const BatchContext = createContext<{
  state: BatchState;
  dispatch: React.Dispatch<BatchAction>;
  hydrated: boolean;
  flushSave: () => void;
} | null>(null);

export function BatchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(batchReducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from IndexedDB on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const [savedBatch, savedSettings, savedActivePreset, savedQStashBatchId] = await Promise.all([
          loadCurrentBatch(),
          loadSettings(),
          loadActivePreset(),
          loadActiveQStashBatchId(),
        ]);

        // If a batch was "running" when we last saved, it means the connection was lost
        let batch = savedBatch;
        // Backfill type for batches saved before video support
        if (batch && !batch.type) {
          batch = { ...batch, type: "image" };
        }
        if (batch && batch.status === "running") {
          // If this batch is running via QStash, keep it as "running" — the hook will reconnect
          if (savedQStashBatchId && batch.id === savedQStashBatchId) {
            // Keep running — QStash is still processing in the background
          } else {
            batch = { ...batch, status: "interrupted" };
          }
        }

        // Revert any images stuck in "editing" status (edit API call lost on reload)
        if (batch && batch.images.some((img) => img.status === "editing")) {
          batch = {
            ...batch,
            images: batch.images.map((img) =>
              img.status === "editing" ? { ...img, status: "completed" as const } : img
            ),
          };
        }

        dispatch({
          type: "HYDRATE",
          currentBatch: batch,
          settings: savedSettings
            ? { ...DEFAULT_SETTINGS, ...savedSettings }
            : undefined,
          activePresetName: savedActivePreset,
          pendingQStashBatchId: savedQStashBatchId,
        });
      } catch {
        // IndexedDB not available, continue with defaults
      }
      setHydrated(true);
    }
    hydrate();
  }, []);

  // Keep refs to the latest batch and viewingHistory so beforeunload/flushSave
  // can access them synchronously
  const batchRef = useRef(state.currentBatch);
  batchRef.current = state.currentBatch;

  const viewingHistoryRef = useRef(state.viewingHistory);
  viewingHistoryRef.current = state.viewingHistory;

  // Persist batch state on changes (debounced).
  // When viewing history: save edits to the history key only.
  // When not viewing history: save to currentBatch (and also history if terminal).
  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      if (state.currentBatch) {
        const isTerminal = ["completed", "cancelled", "error", "interrupted"].includes(
          state.currentBatch.status
        );
        if (state.viewingHistory) {
          if (isTerminal) saveBatchToHistory(state.currentBatch);
        } else if (isTerminal) {
          saveTerminalBatch(state.currentBatch);
        } else {
          saveCurrentBatch(state.currentBatch);
        }
      } else if (!state.viewingHistory) {
        clearCurrentBatch();
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [state.currentBatch, state.viewingHistory, hydrated]);

  // Force-save on page unload to prevent data loss from debounce
  useEffect(() => {
    const handleBeforeUnload = () => {
      const batch = batchRef.current;
      if (!batch) return;
      const isTerminal = ["completed", "cancelled", "error", "interrupted"].includes(batch.status);
      if (viewingHistoryRef.current) {
        if (isTerminal) saveBatchToHistory(batch);
      } else if (isTerminal) {
        saveTerminalBatch(batch);
      } else {
        saveCurrentBatch(batch);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Immediate save — call after critical state changes (e.g. version updates)
  const flushSave = () => {
    const batch = batchRef.current;
    if (!batch) return;
    const isTerminal = ["completed", "cancelled", "error", "interrupted"].includes(batch.status);
    if (viewingHistoryRef.current) {
      if (isTerminal) saveBatchToHistory(batch);
    } else if (isTerminal) {
      saveTerminalBatch(batch);
    } else {
      saveCurrentBatch(batch);
    }
  };

  // Persist settings on changes
  useEffect(() => {
    if (!hydrated) return;
    saveSettings(state.settings);
  }, [state.settings, hydrated]);

  // Persist active preset name on changes
  useEffect(() => {
    if (!hydrated) return;
    saveActivePreset(state.activePresetName);
  }, [state.activePresetName, hydrated]);

  // Archive finished batches to history when status first becomes terminal.
  // Track last archived batch ID + status to avoid redundant writes
  // (subsequent edits are persisted by the debounced save / flushSave instead).
  const archivedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !state.currentBatch) return;
    const { id, status } = state.currentBatch;
    const isTerminal = status === "completed" || status === "cancelled" || status === "error" || status === "interrupted";
    if (!isTerminal) return;

    const archiveKey = `${id}:${status}`;
    if (archivedRef.current === archiveKey) return;

    archivedRef.current = archiveKey;
    archiveBatch(state.currentBatch);
  }, [state.currentBatch?.status, state.currentBatch?.id, hydrated]);

  return (
    <BatchContext.Provider value={{ state, dispatch, hydrated, flushSave }}>
      {children}
    </BatchContext.Provider>
  );
}

export function useBatchContext() {
  const context = useContext(BatchContext);
  if (!context) {
    throw new Error("useBatchContext must be used within a BatchProvider");
  }
  return context;
}
