"use client";

import { useBatch } from "@/hooks/useBatch";
import { RESOLUTIONS, ASPECT_RATIOS, OUTPUT_FORMATS, PRICING } from "@/lib/constants";

export function GenerationSettings() {
  const { state, dispatch } = useBatch();
  const { settings } = state;

  const updateSetting = (update: Partial<typeof settings>) => {
    dispatch({ type: "SET_SETTINGS", settings: update });
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">הגדרות יצירה</h3>

      {/* Resolution */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          רזולוציה
        </label>
        <div className="flex gap-1.5">
          {RESOLUTIONS.map((res) => (
            <button
              key={res}
              onClick={() => updateSetting({ resolution: res })}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                settings.resolution === res
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-gray-200"
              }`}
            >
              {res}
              <span className="block text-[10px] opacity-70">
                ${PRICING[res]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          יחס תמונה
        </label>
        <select
          value={settings.aspectRatio}
          onChange={(e) => updateSetting({ aspectRatio: e.target.value })}
          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio === "auto" ? "אוטומטי" : ratio}
            </option>
          ))}
        </select>
      </div>

      {/* Output Format */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          פורמט
        </label>
        <div className="flex gap-1.5">
          {OUTPUT_FORMATS.map((fmt) => (
            <button
              key={fmt}
              onClick={() => updateSetting({ outputFormat: fmt })}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium uppercase transition-colors ${
                settings.outputFormat === fmt
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-gray-200"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Safety Tolerance */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          רמת בטיחות: {settings.safetyTolerance}
        </label>
        <input
          type="range"
          min={1}
          max={6}
          value={settings.safetyTolerance}
          onChange={(e) => updateSetting({ safetyTolerance: Number(e.target.value) })}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>מחמיר (1)</span>
          <span>מתירני (6)</span>
        </div>
      </div>

      {/* Num Images Per Prompt */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          תמונות לכל פרומפט
        </label>
        <select
          value={settings.numImages}
          onChange={(e) => updateSetting({ numImages: Number(e.target.value) })}
          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* Seed */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          סיד (אופציונלי)
        </label>
        <input
          type="number"
          value={settings.seed ?? ""}
          onChange={(e) =>
            updateSetting({
              seed: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="אקראי"
          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Web Search */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.enableWebSearch}
          onChange={(e) => updateSetting({ enableWebSearch: e.target.checked })}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span className="text-xs font-medium text-muted-foreground">
          חיפוש ברשת (+$0.015)
        </span>
      </label>
    </div>
  );
}
