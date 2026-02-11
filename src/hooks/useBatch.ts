"use client";

import { useBatchContext } from "@/context/BatchContext";

export function useBatch() {
  return useBatchContext();
}
