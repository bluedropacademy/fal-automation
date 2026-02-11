import fs from "fs/promises";
import path from "path";
import type { Preset } from "@/types/preset";
import type { LogEntry } from "@/types/log";

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = path.join(process.cwd(), "data");
const PRESETS_DIR = path.join(DATA_DIR, "presets");
const LOGS_DIR = path.join(DATA_DIR, "logs");
const DOWNLOADS_DIR = IS_VERCEL ? path.join("/tmp", "downloads") : path.join(DATA_DIR, "downloads");

// --- Redis (Vercel/production only) ---

let redis: import("@upstash/redis").Redis | null = null;

async function getRedis() {
  if (!IS_VERCEL) return null;
  if (redis) return redis;
  const { Redis } = await import("@upstash/redis");
  redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  return redis;
}

// --- Local filesystem helpers ---

async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(PRESETS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
}

// --- Presets ---

export async function listPresets(): Promise<Preset[]> {
  const kv = await getRedis();
  if (kv) {
    const names = await kv.smembers("preset:names");
    if (names.length === 0) return [];
    const presets: Preset[] = [];
    for (const name of names) {
      const preset = await kv.get<Preset>(`preset:${name}`);
      if (preset) presets.push(preset);
    }
    return presets.sort((a, b) => a.name.localeCompare(b.name));
  }
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
  const kv = await getRedis();
  if (kv) {
    return await kv.get<Preset>(`preset:${name}`);
  }
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
  const kv = await getRedis();
  if (kv) {
    await kv.set(`preset:${preset.name}`, preset);
    await kv.sadd("preset:names", preset.name);
    return;
  }
  await ensureDataDirs();
  const filePath = path.join(PRESETS_DIR, `${preset.name}.json`);
  await fs.writeFile(filePath, JSON.stringify(preset, null, 2), "utf-8");
}

export async function deletePreset(name: string): Promise<boolean> {
  const kv = await getRedis();
  if (kv) {
    await kv.del(`preset:${name}`);
    await kv.srem("preset:names", name);
    return true;
  }
  try {
    const filePath = path.join(PRESETS_DIR, `${name}.json`);
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

// --- Logs ---

function getLogKey(date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return `logs:${d}`;
}

function getLogFilePath(date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `${d}.jsonl`);
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const kv = await getRedis();
  if (kv) {
    const key = getLogKey(entry.timestamp.slice(0, 10));
    await kv.rpush(key, entry);
    return;
  }
  await ensureDataDirs();
  const filePath = getLogFilePath(entry.timestamp.slice(0, 10));
  await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readLogs(date?: string, batchId?: string): Promise<LogEntry[]> {
  const kv = await getRedis();
  if (kv) {
    const key = getLogKey(date);
    const entries = await kv.lrange<LogEntry>(key, 0, -1);
    if (batchId) {
      return entries.filter((e) => e.batchId === batchId);
    }
    return entries;
  }
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

export function getDownloadDir(batchId: string, batchName?: string): string {
  const folderName = batchName?.trim()
    ? batchName.trim().replace(/[<>:"/\\|?*]/g, "_").substring(0, 100)
    : `batch-${batchId}`;
  return path.join(DOWNLOADS_DIR, folderName);
}

export async function ensureDownloadDir(batchId: string, batchName?: string): Promise<string> {
  const dir = getDownloadDir(batchId, batchName);
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
