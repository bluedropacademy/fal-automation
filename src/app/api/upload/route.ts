import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/supabase-storage";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const url = await uploadFile(file, "uploads");
    if (!url) {
      // Fallback to fal.storage if Supabase upload fails
      const { fal } = await import("@/lib/fal-server");
      const falUrl = await fal.storage.upload(file);
      return NextResponse.json({ url: falUrl });
    }

    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
