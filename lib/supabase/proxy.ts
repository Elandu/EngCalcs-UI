import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const protectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname === "/drawing-review.html";

  if (!claims && protectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (request.nextUrl.pathname === "/drawing-review.html") {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (projectId) {
      const { data: memberships, error: membershipError } = await supabase
        .from("organisation_members")
        .select("organisation_id");
      const organisationIds = [...new Set((memberships ?? []).map((item) => item.organisation_id))];

      if (membershipError || !organisationIds.length) {
        return NextResponse.json({ error: "Drawing project not found." }, { status: 404 });
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .in("organisation_id", organisationIds)
        .maybeSingle();

      if (projectError || !project) {
        return NextResponse.json({ error: "Drawing project not found." }, { status: 404 });
      }
    }
  }

  return response;
}
