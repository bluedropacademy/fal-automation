"use client";

import { createContext, useContext, useReducer, useEffect, useState, type ReactNode } from "react";
import type { Batch, BatchImage, BatchStatus, ImageVersion } from "@/types/batch";
import type { GenerationSettings } from "@/types/generation";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  saveCurrentBatch,
  loadCurrentBatch,
  clearCurrentBatch,
  archiveBatch,
  saveSettings,
  loadSettings,
} from "@/lib/persistence";

interface BatchState {
  prompts: string[];
  settings: GenerationSettings;
  batchName: string;
  currentBatch: Batch | null;
  savedBatch: Batch | null;
  viewingHistory: boolean;
}

type BatchAction =
  | { type: "SET_PROMPTS"; prompts: string[] }
  | { type: "SET_BATCH_NAME"; name: string }
  | { type: "SET_SETTINGS"; settings: Partial<GenerationSettings> }
  | { type: "LOAD_SETTINGS"; settings: GenerationSettings }
  | { type: "START_BATCH"; batch: Batch }
  | { type: "UPDATE_IMAGE"; index: number; update: Partial<BatchImage> }
  | { type: "SET_BATCH_STATUS"; status: BatchStatus }
  | { type: "RESET_BATCH" }
  | { type: "REPLACE_IMAGE_VERSION"; index: number; newVersion: ImageVersion; newResult: BatchImage["result"] }
  | { type: "ADD_IMAGES"; images: BatchImage[] }
  | { type: "SET_IMAGE_VERSION"; index: number; versionNumber: number }
  | { type: "VIEW_HISTORY_BATCH"; batch: Batch }
  | { type: "BACK_TO_CURRENT" }
  | { type: "HYDRATE"; currentBatch: Batch | null; settings?: GenerationSettings };

function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case "SET_PROMPTS":
      return { ...state, prompts: action.prompts };

    case "SET_BATCH_NAME":
      return { ...state, batchName: action.name };

    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case "LOAD_SETTINGS":
      return { ...state, settings: action.settings };

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
      };

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
};

const BatchContext = createContext<{
  state: BatchState;
  dispatch: React.Dispatch<BatchAction>;
  hydrated: boolean;
} | null>(null);

export function BatchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(batchReducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from IndexedDB on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const [savedBatch, savedSettings] = await Promise.all([
          loadCurrentBatch(),
          loadSettings(),
        ]);

        // If a batch was "running" when we last saved, it means the connection was lost
        let batch = savedBatch;
        if (batch && batch.status === "running") {
          batch = { ...batch, status: "interrupted" };
        }

        dispatch({
          type: "HYDRATE",
          currentBatch: batch,
          settings: savedSettings
            ? { ...DEFAULT_SETTINGS, ...savedSettings }
            : undefined,
        });
      } catch {
        // IndexedDB not available, continue with defaults
      }
      setHydrated(true);
    }
    hydrate();
  }, []);

  // Persist batch state on changes (debounced) — skip when viewing history
  useEffect(() => {
    if (!hydrated || state.viewingHistory) return;
    const timeout = setTimeout(() => {
      if (state.currentBatch) {
        saveCurrentBatch(state.currentBatch);
      } else {
        clearCurrentBatch();
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [state.currentBatch, state.viewingHistory, hydrated]);

  // Persist settings on changes
  useEffect(() => {
    if (!hydrated) return;
    saveSettings(state.settings);
  }, [state.settings, hydrated]);

  // Archive finished batches to history (completed, cancelled, error, interrupted)
  useEffect(() => {
    if (!hydrated || !state.currentBatch) return;
    const status = state.currentBatch.status;
    if (status === "completed" || status === "cancelled" || status === "error" || status === "interrupted") {
      archiveBatch(state.currentBatch);
    }
  }, [state.currentBatch?.status, hydrated]);

  return (
    <BatchContext.Provider value={{ state, dispatch, hydrated }}>
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
