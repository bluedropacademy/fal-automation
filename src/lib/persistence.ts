"use client";

import { get, set, del, keys } from "idb-keyval";
import type { Batch } from "@/types/batch";
import type { GenerationSettings } from "@/types/generation";

const CURRENT_BATCH_KEY = "fal:currentBatch";
const BATCH_HISTORY_PREFIX = "fal:batch:";
const SETTINGS_KEY = "fal:settings";

// --- Current Batch ---

export async function saveCurrentBatch(batch: Batch): Promise<void> {
  await set(CURRENT_BATCH_KEY, batch);
}

export async function loadCurrentBatch(): Promise<Batch | null> {
  return (await get(CURRENT_BATCH_KEY)) ?? null;
}

export async function clearCurrentBatch(): Promise<void> {
  await del(CURRENT_BATCH_KEY);
}

// --- Batch History ---

export async function archiveBatch(batch: Batch): Promise<void> {
  // Save to history only. Do NOT delete fal:currentBatch — the debounced save
  // or RESET_BATCH → clearCurrentBatch() handles that when the user starts a new batch.
  await set(`${BATCH_HISTORY_PREFIX}${batch.id}`, batch);
}

/**
 * Dual-save: writes to both fal:currentBatch AND fal:batch:{id}.
 * Used for any save of a terminal-status batch so edits persist in history.
 */
export async function saveTerminalBatch(batch: Batch): Promise<void> {
  await Promise.all([
    set(CURRENT_BATCH_KEY, batch),
    set(`${BATCH_HISTORY_PREFIX}${batch.id}`, batch),
  ]);
}

/** Save a batch directly to history without affecting currentBatch (used for video batches). */
export async function saveBatchToHistory(batch: Batch): Promise<void> {
  await set(`${BATCH_HISTORY_PREFIX}${batch.id}`, batch);
}

export async function loadBatchHistory(): Promise<Batch[]> {
  const allKeys = await keys();
  const batchKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(BATCH_HISTORY_PREFIX)
  );
  const batches: Batch[] = [];
  for (const key of batchKeys) {
    const batch = await get(key);
    if (batch) {
      const b = batch as Batch;
      // Backfill type for batches saved before video support
      if (!b.type) b.type = "image";
      batches.push(b);
    }
  }
  return batches.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteBatchFromHistory(batchId: string): Promise<void> {
  await del(`${BATCH_HISTORY_PREFIX}${batchId}`);
}

// --- Settings ---

export async function saveSettings(settings: GenerationSettings): Promise<void> {
  await set(SETTINGS_KEY, settings);
}

export async function loadSettings(): Promise<GenerationSettings | null> {
  return (await get(SETTINGS_KEY)) ?? null;
}

// --- Gemini Prompt Presets ---

const GEMINI_PRESETS_KEY = "fal:geminiPresets";

export interface GeminiPreset {
  name: string;
  prompt: string;
}

export async function saveGeminiPresets(presets: GeminiPreset[]): Promise<void> {
  await set(GEMINI_PRESETS_KEY, presets);
}

export async function loadGeminiPresets(): Promise<GeminiPreset[]> {
  return (await get(GEMINI_PRESETS_KEY)) ?? [];
}
