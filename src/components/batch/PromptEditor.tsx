"use client";

import { useMemo } from "react";
import { useBatch } from "@/hooks/useBatch";
import { parsePrompts, estimateCost } from "@/lib/constants";
import { formatCost } from "@/lib/format-utils";

export function PromptEditor() {
  const { state, dispatch } = useBatch();
  const { settings } = state;

  const rawText = state.prompts.join("\n");

  const validPrompts = useMemo(() => parsePrompts(rawText), [rawText]);

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
          placeholder="טקסט שיתווסף לפני כל פרומפט..."
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-foreground">
            פרומפטים (שורה אחת = תמונה אחת)
          </label>
          <span className="text-sm text-muted-foreground">
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
          placeholder="טקסט שיתווסף אחרי כל פרומפט..."
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span>
          <strong>{validPrompts.length}</strong> תמונות
          {settings.numImages > 1 && (
            <span className="text-muted-foreground">
              {" "}
              ({validPrompts.length * settings.numImages} סה&quot;כ עם {settings.numImages} וריאציות)
            </span>
          )}
        </span>
        <span className="font-medium">עלות משוערת: {formatCost(cost)}</span>
      </div>
    </div>
  );
}
