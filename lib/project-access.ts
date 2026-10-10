import { createClient } from "@/lib/supabase/server";
import { uuidPattern } from "@/lib/engineering-provenance";

type Client = Awaited<ReturnType<typeof createClient>>;
type ProjectRole = "owner" | "admin" | "engineer" | "reviewer" | "viewer";

export type ProjectAccess =
  | { ok: true; client: Client; projectId: string; organisationId: string; userId: string; role: ProjectRole }
  | { ok: false; status: number; error: string };

export async function requireProjectAccess(projectId: string): Promise<ProjectAccess> {
  if (!uuidPattern.test(projectId)) return { ok: false, status: 400, error: "Invalid project ID." };
  const client = await createClient();
  const { data: claims, error: authError } = await client.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || !userId) return { ok: false, status: 401, error: "Unauthorized." };

  const { data: project, error: projectError } = await client.from("projects")
    .select("id, organisation_id").eq("id", projectId).maybeSingle();
  if (projectError) return { ok: false, status: 500, error: "Unable to load project." };
  if (!project) return { ok: false, status: 404, error: "Project not found." };

  const { data: membership, error: membershipError } = await client.from("organisation_members")
    .select("role").eq("organisation_id", project.organisation_id)
    .eq("user_id", userId).maybeSingle();
  if (membershipError || !membership) return { ok: false, status: 403, error: "Project access denied." };

  return {
    ok: true,
    client,
    projectId: project.id,
    organisationId: project.organisation_id,
    userId,
    role: membership.role as ProjectRole,
  };
}
