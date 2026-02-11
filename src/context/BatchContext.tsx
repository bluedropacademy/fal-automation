"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { Batch, BatchImage, BatchStatus } from "@/types/batch";
import type { GenerationSettings } from "@/types/generation";
import { DEFAULT_SETTINGS } from "@/lib/constants";

interface BatchState {
  prompts: string[];
  settings: GenerationSettings;
  currentBatch: Batch | null;
}

type BatchAction =
  | { type: "SET_PROMPTS"; prompts: string[] }
  | { type: "SET_SETTINGS"; settings: Partial<GenerationSettings> }
  | { type: "LOAD_SETTINGS"; settings: GenerationSettings }
  | { type: "START_BATCH"; batch: Batch }
  | { type: "UPDATE_IMAGE"; index: number; update: Partial<BatchImage> }
  | { type: "SET_BATCH_STATUS"; status: BatchStatus }
  | { type: "RESET_BATCH" };

function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case "SET_PROMPTS":
      return { ...state, prompts: action.prompts };

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

    default:
      return state;
  }
}

const initialState: BatchState = {
  prompts: [],
  settings: DEFAULT_SETTINGS,
  currentBatch: null,
};

const BatchContext = createContext<{
  state: BatchState;
  dispatch: React.Dispatch<BatchAction>;
} | null>(null);

export function BatchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(batchReducer, initialState);

  return (
    <BatchContext.Provider value={{ state, dispatch }}>
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
