import { NextResponse } from "next/server";

const FAL_API_BASE = "https://api.fal.ai/v1";

export async function GET() {
  const key = process.env.FAL_KEY;
  if (!key) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }

  const headers: HeadersInit = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };

  // Try billing-events endpoint (gives per-request cost data)
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const billingRes = await fetch(
      `${FAL_API_BASE}/models/billing-events?start_date=${startOfMonth}&limit=1000`,
      { headers, next: { revalidate: 0 } }
    );

    if (billingRes.ok) {
      const billingData = await billingRes.json();
      const events = billingData.data ?? billingData.events ?? billingData ?? [];

      let totalCostNanoUsd = 0;
      let requestCount = 0;

      if (Array.isArray(events)) {
        for (const event of events) {
          // cost_estimate_nano_usd is in nano-USD (divide by 1e9 for dollars)
          if (event.cost_estimate_nano_usd) {
            totalCostNanoUsd += event.cost_estimate_nano_usd;
          } else if (event.cost) {
            totalCostNanoUsd += event.cost * 1e9;
          }
          requestCount++;
        }
      }

      const totalCostUsd = totalCostNanoUsd / 1e9;

      return NextResponse.json({
        source: "billing-events",
        monthlySpendUsd: totalCostUsd,
        requestCount,
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      });
    }
  } catch {
    // billing-events not available, try usage
  }

  // Try usage endpoint
  try {
    const usageRes = await fetch(
      `${FAL_API_BASE}/models/usage?expand=summary`,
      { headers, next: { revalidate: 0 } }
    );

    if (usageRes.ok) {
      const usageData = await usageRes.json();
      let totalCost = 0;

      if (usageData.summary) {
        for (const entry of Object.values(usageData.summary) as Array<{ cost?: number }>) {
          totalCost += entry.cost ?? 0;
        }
      } else if (Array.isArray(usageData.data)) {
        for (const entry of usageData.data) {
          totalCost += entry.cost ?? 0;
        }
      }

      return NextResponse.json({
        source: "usage",
        monthlySpendUsd: totalCost,
        requestCount: 0,
      });
    }
  } catch {
    // usage not available either
  }

  return NextResponse.json({
    source: "unavailable",
    error: "Could not fetch balance data. The API key may not have admin permissions.",
  });
}
