import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeAuthRedirectUrl } from "@/lib/safe-auth-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const redirectUrl = safeAuthRedirectUrl(
    searchParams.get("next"),
    request.url,
  );
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("confirmation", "failed");
  const next = searchParams.get("next");
  if (next) loginUrl.searchParams.set("next", next);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectUrl);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(loginUrl);
}
