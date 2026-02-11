"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useBatch } from "@/hooks/useBatch";
import { Tooltip } from "@/components/common/Tooltip";
import { RESOLUTIONS, ASPECT_RATIOS, OUTPUT_FORMATS, PRICING, KIE_PRICING, USD_TO_ILS, WEB_SEARCH_ADDON_PRICE } from "@/lib/constants";
import type { Provider } from "@/types/generation";

const SAFETY_LABELS: Record<number, string> = {
  1: "מחמיר מאוד",
  2: "מחמיר",
  3: "מתון",
  4: "רגיל",
  5: "מתירני",
  6: "מתירני מאוד",
};

const PROVIDERS: Array<{ value: Provider; label: string; price: string }> = [
  { value: "fal", label: "Fal AI", price: "מ-$0.15" },
  { value: "kie", label: "Kie AI", price: "מ-$0.09" },
];

export function GenerationSettings() {
  const { state, dispatch } = useBatch();
  const { settings } = state;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isFal = (settings.provider ?? "fal") !== "kie";
  const currentPricing = isFal ? PRICING : KIE_PRICING;
  const availableFormats = isFal
    ? OUTPUT_FORMATS
    : OUTPUT_FORMATS.filter((f) => f !== "webp");

  const updateSetting = (update: Partial<typeof settings>) => {
    dispatch({ type: "SET_SETTINGS", settings: update });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Provider Selection */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
          ספק AI
          <Tooltip content="Fal AI — יותר תכונות (סיד, חיפוש ברשת, מספר תמונות). Kie AI — זול יותר (~40% חיסכון)">
            <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
          </Tooltip>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                const update: Partial<typeof settings> = { provider: p.value };
                if (p.value === "kie") {
                  update.numImages = 1;
                  update.enableWebSearch = false;
                  update.seed = undefined;
                  if (settings.outputFormat === "webp") {
                    update.outputFormat = "png";
                  }
                }
                updateSetting(update);
              }}
              className={`flex flex-col items-center rounded-lg px-3 py-2.5 transition-all ${
                (settings.provider ?? "fal") === p.value
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              <span className="text-sm font-bold">{p.label}</span>
              <span className={`text-xs mt-0.5 ${
                (settings.provider ?? "fal") === p.value ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}>
                {p.price}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
          רזולוציה
          <Tooltip content="הרזולוציה משפיעה על איכות התמונה ועל המחיר. 4K יקר פי 2 מ-1K/2K">
            <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
          </Tooltip>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {RESOLUTIONS.map((res) => (
            <button
              key={res}
              onClick={() => updateSetting({ resolution: res })}
              className={`flex flex-col items-center rounded-lg px-3 py-2.5 transition-all ${
                settings.resolution === res
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              <span className="text-sm font-bold">{res}</span>
              <span className={`text-xs mt-0.5 ${
                settings.resolution === res ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}>
                ₪{(currentPricing[res] * USD_TO_ILS).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
          יחס תמונה
          <Tooltip content='יחס הגובה-רוחב של התמונה. "אוטומטי" נותן למודל לבחור'>
            <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
          </Tooltip>
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
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
          פורמט
          <Tooltip content="PNG — איכות מקסימלית, JPEG — קל יותר, WebP — איזון בין איכות לגודל">
            <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
          </Tooltip>
        </label>
        <div className={`grid gap-2 ${isFal ? "grid-cols-3" : "grid-cols-2"}`}>
          {availableFormats.map((fmt) => (
            <button
              key={fmt}
              onClick={() => updateSetting({ outputFormat: fmt })}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase transition-all ${
                settings.outputFormat === fmt
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                  : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors self-start"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`} />
        הגדרות מתקדמות
      </button>

      {/* Advanced Settings */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          showAdvanced ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4">
            {/* Safety Tolerance — Fal only */}
            {isFal && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
                  רמת בטיחות:{" "}
                  <span className="text-foreground font-semibold">
                    {SAFETY_LABELS[settings.safetyTolerance]}
                  </span>
                  <Tooltip content="ככל שהערך גבוה יותר, המודל מתירני יותר בתוכן. ברירת מחדל: רגיל (4)">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                  </Tooltip>
                </label>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={settings.safetyTolerance}
                  onChange={(e) => updateSetting({ safetyTolerance: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>מחמיר</span>
                  <span>מתירני</span>
                </div>
              </div>
            )}

            {/* Num Images Per Prompt — Fal only */}
            {isFal && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
                  תמונות לכל פרומפט
                  <Tooltip content="מספר תמונות שונות שייווצרו לכל פרומפט">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                  </Tooltip>
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
            )}

            {/* Seed — Fal only */}
            {isFal && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
                  סיד (אופציונלי)
                  <Tooltip content="ערך קבוע מייצר תוצאה זהה. השאר ריק לתוצאות אקראיות">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                  </Tooltip>
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
            )}

            {/* Concurrency — both providers */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
                מקביליות
                <Tooltip content="כמה תמונות נוצרות במקביל. ערך גבוה = מהר יותר אך עלול להעמיס">
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </Tooltip>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateSetting({ concurrency: n })}
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition-all ${
                      (settings.concurrency ?? 2) === n
                        ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                        : "bg-white border border-border text-foreground hover:border-primary/30 hover:bg-primary/5"
                    }`}
                  >
                    {n === 1 ? "סדרתי" : `×${n}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Web Search — Fal only */}
            {isFal && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableWebSearch}
                  onChange={(e) => updateSetting({ enableWebSearch: e.target.checked })}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  חיפוש ברשת (+₪{(WEB_SEARCH_ADDON_PRICE * USD_TO_ILS).toFixed(3)})
                </span>
                <Tooltip content="חיפוש ברשת לתמונות עדכניות. מוסיף עלות קטנה לכל תמונה">
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </Tooltip>
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
