"use client";

import { Fragment } from "react";
import { Images, Type, Bookmark, Settings, ImagePlus, ImageIcon, Zap } from "lucide-react";
import { BalanceDisplay } from "@/components/common/BalanceDisplay";
import { SectionCard } from "@/components/common/SectionCard";
import { CollapsibleSection } from "@/components/common/CollapsibleSection";
import { PromptEditor } from "@/components/batch/PromptEditor";
import { BatchControls } from "@/components/batch/BatchControls";
import { BatchProgress } from "@/components/batch/BatchProgress";
import { ImageGallery } from "@/components/gallery/ImageGallery";
import { VideoGallery } from "@/components/gallery/VideoGallery";
import { GenerationSettings } from "@/components/settings/GenerationSettings";
import { PresetManager } from "@/components/settings/PresetManager";
import { ReferenceImages } from "@/components/settings/ReferenceImages";
import { BatchHistory } from "@/components/batch/BatchHistory";
import { useBatch } from "@/hooks/useBatch";
import { parsePrompts } from "@/lib/constants";

function GallerySwitch() {
  const { state } = useBatch();
  if (state.currentBatch?.type === "video") {
    return <VideoGallery />;
  }
  return <ImageGallery />;
}

function WorkflowSteps() {
  const { state } = useBatch();
  const validPrompts = parsePrompts(state.prompts.join("\n"));

  const activeStep = !state.currentBatch
    ? (validPrompts.length > 0 ? 1 : 0)
    : state.currentBatch.status === "running"
      ? 2
      : 3;

  const steps = [
    { label: "פרומפטים", icon: Type },
    { label: "הגדרות", icon: Settings },
    { label: "יצירה", icon: Zap },
    { label: "תוצאות", icon: ImageIcon },
  ];

  return (
    <div className="flex items-center justify-center gap-0 py-3 px-6 border-b border-border/60 bg-gradient-to-b from-card to-background">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        return (
          <Fragment key={i}>
            {i > 0 && (
              <div className={`h-px w-10 transition-colors duration-300 ${isDone ? "bg-primary" : "bg-border/60"}`} />
            )}
            <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
              isActive
                ? "bg-primary/10 text-primary shadow-sm shadow-primary/10 ring-1 ring-primary/20"
                : isDone
                  ? "text-primary/70"
                  : "text-muted-foreground/60"
            }`}>
              <Icon className="h-3.5 w-3.5" />
              {step.label}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="relative bg-card px-6 py-3.5 border-b border-border/60 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-l from-primary via-primary/70 to-primary/30" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
              <Images className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              Fal Automation — מחולל תמונות בכמויות
            </h1>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-1.5">
            <BalanceDisplay />
          </div>
        </div>
      </header>

      {/* Workflow Steps */}
      <WorkflowSteps />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl flex flex-col gap-5">
            <SectionCard
              title="פרומפטים"
              icon={<Type className="h-4 w-4" />}
              subtitle="שורה אחת = תמונה אחת"
            >
              <PromptEditor />
            </SectionCard>

            <BatchControls />

            <BatchProgress />

            <GallerySwitch />
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-80 shrink-0 overflow-y-auto border-s border-border/60 bg-muted/20 p-4 flex flex-col gap-4">
          <CollapsibleSection
            title="פריסטים"
            icon={<Bookmark className="h-4 w-4" />}
            defaultOpen={false}
          >
            <PresetManager />
          </CollapsibleSection>

          <CollapsibleSection
            title="הגדרות יצירה"
            icon={<Settings className="h-4 w-4" />}
            defaultOpen={true}
          >
            <GenerationSettings />
          </CollapsibleSection>

          <CollapsibleSection
            title="תמונות רפרנס"
            icon={<ImagePlus className="h-4 w-4" />}
            defaultOpen={false}
          >
            <ReferenceImages />
          </CollapsibleSection>

          <BatchHistory />
        </aside>
      </div>
    </div>
  );
}
