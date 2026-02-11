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
  await set(`${BATCH_HISTORY_PREFIX}${batch.id}`, batch);
  await del(CURRENT_BATCH_KEY);
}

export async function loadBatchHistory(): Promise<Batch[]> {
  const allKeys = await keys();
  const batchKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(BATCH_HISTORY_PREFIX)
  );
  const batches: Batch[] = [];
  for (const key of batchKeys) {
    const batch = await get(key);
    if (batch) batches.push(batch as Batch);
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
