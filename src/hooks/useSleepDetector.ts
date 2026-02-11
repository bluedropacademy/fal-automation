"use client";

import { useEffect, useRef } from "react";

interface SleepDetectorOptions {
  onSleepDetected: () => void;
  /** Time gap threshold in ms to consider as sleep (default: 10000 = 10s) */
  threshold?: number;
  /** Whether detection is enabled */
  enabled: boolean;
}

export function useSleepDetector({
  onSleepDetected,
  threshold = 10000,
  enabled,
}: SleepDetectorOptions) {
  const lastTickRef = useRef(Date.now());
  const callbackRef = useRef(onSleepDetected);
  callbackRef.current = onSleepDetected;

  useEffect(() => {
    if (!enabled) return;

    lastTickRef.current = Date.now();

    // Visibility change detection
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const gap = Date.now() - lastTickRef.current;
        if (gap > threshold) {
          callbackRef.current();
        }
      }
      lastTickRef.current = Date.now();
    };

    // Heartbeat - check for time gaps via setInterval
    const interval = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTickRef.current;
      if (gap > threshold) {
        callbackRef.current();
      }
      lastTickRef.current = now;
    }, 2000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [enabled, threshold]);
}
