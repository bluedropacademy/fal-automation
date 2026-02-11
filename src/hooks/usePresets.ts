"use client";

import { useState, useCallback, useEffect } from "react";
import type { Preset } from "@/types/preset";

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const savePreset = useCallback(
    async (preset: Preset) => {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      if (res.ok) {
        await fetchPresets();
      }
      return res.ok;
    },
    [fetchPresets]
  );

  const deletePreset = useCallback(
    async (name: string) => {
      const res = await fetch(`/api/presets/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchPresets();
      }
      return res.ok;
    },
    [fetchPresets]
  );

  const loadPreset = useCallback(async (name: string): Promise<Preset | null> => {
    const res = await fetch(`/api/presets/${encodeURIComponent(name)}`);
    if (res.ok) {
      return await res.json();
    }
    return null;
  }, []);

  return { presets, loading, fetchPresets, savePreset, deletePreset, loadPreset };
}
