import fs from "fs/promises";
import path from "path";
import type { Preset } from "@/types/preset";
import type { LogEntry } from "@/types/log";

const DATA_DIR = path.join(process.cwd(), "data");
const PRESETS_DIR = path.join(DATA_DIR, "presets");
const LOGS_DIR = path.join(DATA_DIR, "logs");
const DOWNLOADS_DIR = path.join(DATA_DIR, "downloads");

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(PRESETS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
}

// --- Presets ---

export async function listPresets(): Promise<Preset[]> {
  await ensureDataDirs();
  try {
    const files = await fs.readdir(PRESETS_DIR);
    const presets: Preset[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const content = await fs.readFile(path.join(PRESETS_DIR, file), "utf-8");
      presets.push(JSON.parse(content));
    }
    return presets.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function loadPreset(name: string): Promise<Preset | null> {
  await ensureDataDirs();
  try {
    const filePath = path.join(PRESETS_DIR, `${name}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function savePreset(preset: Preset): Promise<void> {
  await ensureDataDirs();
  const filePath = path.join(PRESETS_DIR, `${preset.name}.json`);
  await fs.writeFile(filePath, JSON.stringify(preset, null, 2), "utf-8");
}

export async function deletePreset(name: string): Promise<boolean> {
  try {
    const filePath = path.join(PRESETS_DIR, `${name}.json`);
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

// --- Logs ---

function getLogFilePath(date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `${d}.jsonl`);
}

export async function appendLog(entry: LogEntry): Promise<void> {
  await ensureDataDirs();
  const filePath = getLogFilePath(entry.timestamp.slice(0, 10));
  await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readLogs(date?: string, batchId?: string): Promise<LogEntry[]> {
  await ensureDataDirs();
  const filePath = getLogFilePath(date);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const entries = content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LogEntry);
    if (batchId) {
      return entries.filter((e) => e.batchId === batchId);
    }
    return entries;
  } catch {
    return [];
  }
}

// --- Downloads ---

export function getDownloadDir(batchId: string): string {
  return path.join(DOWNLOADS_DIR, `batch-${batchId}`);
}

export async function ensureDownloadDir(batchId: string): Promise<string> {
  const dir = getDownloadDir(batchId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function downloadImage(
  url: string,
  filePath: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}
