import { NextRequest, NextResponse } from "next/server";
import { listPresets, savePreset } from "@/lib/file-utils";
import type { Preset } from "@/types/preset";

export async function GET() {
  try {
    const presets = await listPresets();
    return NextResponse.json(presets);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list presets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const preset = (await request.json()) as Preset;
    preset.updatedAt = new Date().toISOString();
    if (!preset.createdAt) {
      preset.createdAt = preset.updatedAt;
    }
    await savePreset(preset);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save preset" },
      { status: 500 }
    );
  }
}
