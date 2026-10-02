import { NextResponse } from "next/server";

import { PREVIEWABLE_CALCULATION_IDS } from "@/lib/calculation-catalogue";
import { previewFailure } from "@/lib/calculation-preview";
import { OPENCALCS_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_PREVIEW_BYTES = 512_000;
const PREVIEW_TIMEOUT_MS = 30_000;

/**
 * Runs a calculation in the engine without saving anything. Previews let structural
 * workspaces respond while inputs are edited; only the run route creates project records.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ calculationId: string }> },
) {
  const { calculationId } = await context.params;
  if (!PREVIEWABLE_CALCULATION_IDS.has(calculationId)) {
    return NextResponse.json({ error: "Live preview is not available for this calculation." }, { status: 404 });
  }

  const text = await request.text();
  if (text.length > MAX_PREVIEW_BYTES) {
    return NextResponse.json({ error: "The model is too large for live preview. Use Run and save." }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  const inputs = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { inputs?: unknown }).inputs
    : undefined;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return NextResponse.json({ error: "Request body must be {\"inputs\": {...}}." }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: claimsData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ]);
  if (!claimsData?.claims?.sub || !sessionData.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${OPENCALCS_API_URL.replace(/\/$/, "")}/api/v1/calculations/${encodeURIComponent(calculationId)}/run`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
        cache: "no-store",
        signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
      },
    );
  } catch {
    return NextResponse.json({ error: "The calculation engine did not respond. Try again or use Run and save." }, { status: 504 });
  }

  const body: unknown = await response.json().catch(() => null);
  const failure = previewFailure(response.status, body);
  if (failure) return NextResponse.json({ error: failure.message }, { status: failure.status });
  return NextResponse.json({ result: body, preview: true });
}
