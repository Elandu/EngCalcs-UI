import { NextResponse } from "next/server";

import { ENGCALCS_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const [{ data: claimsData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ]);

  if (!claimsData?.claims?.sub || !sessionData.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(
    `${ENGCALCS_API_URL.replace(/\/$/, "")}/api/v1/calculations`,
    {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to load calculation library." },
      { status: response.status === 401 || response.status === 403 ? response.status : 502 },
    );
  }

  return NextResponse.json(await response.json());
}
