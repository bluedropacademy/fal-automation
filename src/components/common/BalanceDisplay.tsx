"use client";

import { useEffect, useState, useCallback } from "react";
import { Wallet, RefreshCw, AlertCircle } from "lucide-react";
import { USD_TO_ILS } from "@/lib/constants";

interface BalanceData {
  source: string;
  monthlySpendUsd?: number;
  requestCount?: number;
  month?: string;
  error?: string;
}

export function BalanceDisplay() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/balance");
      const json = await res.json();
      setData(json);
    } catch {
      setData({ source: "error", error: "Failed to fetch" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
        <Wallet className="h-3.5 w-3.5" />
        <span>טוען...</span>
      </div>
    );
  }

  if (!data || data.source === "unavailable" || data.source === "error") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={data?.error}>
        <AlertCircle className="h-3.5 w-3.5" />
        <span>קרדיטים: לא זמין</span>
        <button
          onClick={fetchBalance}
          className="p-0.5 hover:text-foreground transition-colors"
          title="רענן"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const spendUsd = data.monthlySpendUsd ?? 0;
  const spendIls = spendUsd * USD_TO_ILS;

  return (
    <div className="flex items-center gap-2 text-xs">
      <Wallet className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">
        הוצאה החודש:
      </span>
      <span className="font-semibold text-foreground">
        ${spendUsd.toFixed(2)}
      </span>
      <span className="text-muted-foreground">
        (₪{spendIls.toFixed(2)})
      </span>
      {data.requestCount !== undefined && data.requestCount > 0 && (
        <span className="text-muted-foreground">
          | {data.requestCount} בקשות
        </span>
      )}
      <button
        onClick={fetchBalance}
        className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        title="רענן"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}
