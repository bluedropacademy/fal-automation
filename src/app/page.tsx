"use client";

import { Images } from "lucide-react";
import { PromptEditor } from "@/components/batch/PromptEditor";
import { BatchControls } from "@/components/batch/BatchControls";
import { BatchProgress } from "@/components/batch/BatchProgress";
import { ImageGallery } from "@/components/gallery/ImageGallery";
import { GenerationSettings } from "@/components/settings/GenerationSettings";
import { PresetManager } from "@/components/settings/PresetManager";
import { ReferenceImages } from "@/components/settings/ReferenceImages";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <Images className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground">
            Fal Automation — מחולל תמונות בכמויות
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl flex flex-col gap-6">
            <PromptEditor />

            <div className="flex items-center justify-between">
              <BatchControls />
            </div>

            <BatchProgress />
            <ImageGallery />
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-72 shrink-0 overflow-y-auto border-s border-border bg-card p-4 flex flex-col gap-6">
          <PresetManager />
          <hr className="border-border" />
          <GenerationSettings />
          <hr className="border-border" />
          <ReferenceImages />
        </aside>
      </div>
    </div>
  );
}
