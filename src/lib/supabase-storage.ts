import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  supabase = createClient(url, key);
  return supabase;
}

const BUCKET = "generated-files";

type FileCategory = "images" | "videos" | "edits" | "uploads";

function buildPath(category: FileCategory, extension: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const uuid = crypto.randomUUID();
  return `${category}/${y}/${m}/${d}/${uuid}.${extension}`;
}

function getPublicUrl(path: string): string {
  const url = process.env.SUPABASE_URL!;
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

function extensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "application/octet-stream": "bin",
  };
  return map[contentType] ?? contentType.split("/")[1] ?? "bin";
}

/**
 * Download a file from a temporary URL and re-upload to Supabase Storage.
 * Returns the permanent public URL, or null if the upload fails.
 */
export async function persistFile(
  tempUrl: string,
  category: FileCategory,
  contentType: string
): Promise<string | null> {
  try {
    const response = await fetch(tempUrl);
    if (!response.ok) {
      console.error(`[supabase-storage] Download failed: ${response.status} for ${tempUrl}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const ext = extensionFromContentType(contentType);
    const storagePath = buildPath(category, ext);

    const client = getClient();
    const { error } = await client.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error(`[supabase-storage] Upload failed:`, error.message);
      return null;
    }

    return getPublicUrl(storagePath);
  } catch (err) {
    console.error(`[supabase-storage] persistFile error:`, err);
    return null;
  }
}

/**
 * Upload a File/Blob directly to Supabase Storage.
 * Returns the permanent public URL, or null if the upload fails.
 */
export async function uploadFile(
  file: File | Blob,
  category: FileCategory = "uploads"
): Promise<string | null> {
  try {
    const contentType = file.type || "application/octet-stream";
    const ext = extensionFromContentType(contentType);
    const storagePath = buildPath(category, ext);

    const client = getClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await client.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error(`[supabase-storage] uploadFile failed:`, error.message);
      return null;
    }

    return getPublicUrl(storagePath);
  } catch (err) {
    console.error(`[supabase-storage] uploadFile error:`, err);
    return null;
  }
}
