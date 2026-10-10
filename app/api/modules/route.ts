import { engineeringCatalogueProxy } from "@/lib/engineering-catalogue-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return engineeringCatalogueProxy("modules");
}
