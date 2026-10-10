import { NextResponse } from "next/server";

import { OPENCALCS_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/** Read-only authenticated proxy for EngCalcs host module metadata. */
export async function engineeringCatalogueProxy(
  endpoint: "modules" | "connections",
  calculationId?: string,
) {
  const supabase = await createClient();
  const [{ data: claims }, { data: session }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ]);
  if (!claims?.claims?.sub || !session.session?.access_token) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (calculationId && !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(calculationId)) {
    return NextResponse.json({ error: "Invalid calculation identifier." }, { status: 400 });
  }
  const base = OPENCALCS_API_URL.replace(/\/$/, "");
  const query = calculationId ? `?calculation_id=${encodeURIComponent(calculationId)}` : "";
  try {
    const response = await fetch(`${base}/api/v1/${endpoint}${query}`, {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Module integration information is unavailable." },
        {
          status: response.status === 401 || response.status === 403
            ? response.status : 502,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: "The module registry returned an invalid response." },
        { status: 502 },
      );
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "The module registry did not respond." },
      { status: 504, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
