"use client";

import { useMemo, useState } from "react";
import { Calculator, Wand2 } from "lucide-react";
import { useBatch } from "@/hooks/useBatch";
import { parsePrompts, estimateCost } from "@/lib/constants";
import { formatCost } from "@/lib/format-utils";

export function PromptEditor() {
  const { state, dispatch } = useBatch();
  const { settings } = state;

  const rawText = state.prompts.join("\n");
  const validPrompts = useMemo(() => parsePrompts(rawText), [rawText]);

  const [showPrefixSuffix, setShowPrefixSuffix] = useState(
    Boolean(settings.promptPrefix || settings.promptSuffix)
  );

  const cost = useMemo(
    () =>
      estimateCost(
        validPrompts.length,
        settings.numImages,
        settings.resolution,
        settings.enableWebSearch
      ),
    [validPrompts.length, settings.numImages, settings.resolution, settings.enableWebSearch]
  );

  const handleTextChange = (text: string) => {
    dispatch({ type: "SET_PROMPTS", prompts: text.split("\n") });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Prefix/Suffix toggle */}
      <button
        type="button"
        onClick={() => setShowPrefixSuffix(!showPrefixSuffix)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors self-start"
      >
        <Wand2 className="h-3.5 w-3.5" />
        {showPrefixSuffix ? "הסתר קידומת/סיומת" : "הוסף קידומת/סיומת"}
      </button>

      {/* Prefix/Suffix fields */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          showPrefixSuffix ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                קידומת (Prefix)
              </label>
              <input
                type="text"
                dir="ltr"
                value={settings.promptPrefix}
                onChange={(e) =>
                  dispatch({ type: "SET_SETTINGS", settings: { promptPrefix: e.target.value } })
                }
                placeholder="photorealistic, 8K, detailed"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                סיומת (Suffix)
              </label>
              <input
                type="text"
                dir="ltr"
                value={settings.promptSuffix}
                onChange={(e) =>
                  dispatch({ type: "SET_SETTINGS", settings: { promptSuffix: e.target.value } })
                }
                placeholder="cinematic lighting, high quality"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Preview of composed prompt */}
            {(settings.promptPrefix || settings.promptSuffix) && validPrompts.length > 0 && (
              <div className="rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground font-mono" dir="ltr">
                <span className="text-primary font-medium">{settings.promptPrefix}</span>
                {settings.promptPrefix ? " " : ""}
                {validPrompts[0]}
                {settings.promptSuffix ? " " : ""}
                <span className="text-primary font-medium">{settings.promptSuffix}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main textarea */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-foreground">
            פרומפטים
          </label>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold text-primary">
            {validPrompts.length} תמונות
          </span>
        </div>
        <textarea
          dir="ltr"
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={"a cat sitting on a windowsill\nsunset over the ocean\n# this is a comment (will be skipped)\na mountain landscape at dawn"}
          rows={12}
          className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          שורות ריקות ושורות שמתחילות ב-# יידלגו
        </p>
      </div>

      {/* Cost summary */}
      <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <span>
            <strong className="text-foreground">{validPrompts.length}</strong>
            <span className="text-muted-foreground"> תמונות</span>
            {settings.numImages > 1 && (
              <span className="text-muted-foreground">
                {" "}
                ({validPrompts.length * settings.numImages} סה&quot;כ עם {settings.numImages} וריאציות)
              </span>
            )}
          </span>
        </div>
        <span className="font-bold text-primary text-base">{formatCost(cost)}</span>
      </div>
    </div>
  );
}
