"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { Preset } from "@/types/preset";

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPresets = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetch("/api/presets");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPresets(data);
    } catch {
      toast.error("שגיאה בטעינת רשימת הפריסטים");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const savePreset = useCallback(
    async (preset: Preset): Promise<boolean> => {
      setIsSaving(true);
      try {
        const res = await fetch("/api/presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preset),
        });
        if (!res.ok) throw new Error();
        await fetchPresets();
        return true;
      } catch {
        toast.error(`שגיאה בשמירת הפריסט "${preset.name}"`);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchPresets]
  );

  const deletePreset = useCallback(
    async (name: string): Promise<boolean> => {
      setIsDeleting(true);
      try {
        const res = await fetch(`/api/presets/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        await fetchPresets();
        return true;
      } catch {
        toast.error(`שגיאה במחיקת הפריסט "${name}"`);
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [fetchPresets]
  );

  const loadPreset = useCallback(
    async (name: string): Promise<Preset | null> => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/presets/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        toast.error(`שגיאה בטעינת הפריסט "${name}"`);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    presets,
    isFetching,
    isSaving,
    isDeleting,
    isLoading,
    fetchPresets,
    savePreset,
    deletePreset,
    loadPreset,
  };
}
