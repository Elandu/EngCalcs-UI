import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const REPORT_BUCKET = "issued-calculation-packs";

function adminClient() {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const secretKey =
    secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return json({ error: "Missing user token" }, 401);

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Invalid user token" }, 401);

  const body = await req.json().catch(() => null);
  const reportId = body?.reportId;
  if (!reportId) return json({ error: "reportId is required" }, 400);

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, project_id, storage_path, title, revision, status")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError || !report) return json({ error: "Report not found" }, 404);
  if (report.status !== "issued") {
    return json({ error: "Only issued reports can be downloaded" }, 409);
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, organisation_id, project_number")
    .eq("id", report.project_id)
    .maybeSingle();

  if (!project) return json({ error: "Project not found" }, 404);

  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return json({ error: "Project membership required" }, 403);

  const filenameBase = project.project_number
    ? project.project_number.replace(/[^A-Za-z0-9._-]+/g, "-")
    : project.id;
  const { data: signed, error: signedError } = await admin.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(report.storage_path, 900, {
      download: `${filenameBase}-wind-calculation-pack-r${report.revision}.pdf`,
    });

  if (signedError || !signed?.signedUrl) {
    return json({ error: signedError?.message ?? "Unable to sign report URL" }, 500);
  }

  return json({
    reportId: report.id,
    downloadUrl: signed.signedUrl,
    downloadExpiresIn: 900,
  });
});
