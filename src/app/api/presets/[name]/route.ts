import { NextRequest, NextResponse } from "next/server";
import { loadPreset, deletePreset } from "@/lib/file-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const preset = await loadPreset(decodeURIComponent(name));
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }
    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load preset" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const deleted = await deletePreset(decodeURIComponent(name));
    if (!deleted) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete preset" },
      { status: 500 }
    );
  }
}
