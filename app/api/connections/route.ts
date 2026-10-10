import { engineeringCatalogueProxy } from "@/lib/engineering-catalogue-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const calculationId = new URL(request.url).searchParams.get("calculationId") ?? undefined;
  return engineeringCatalogueProxy("connections", calculationId);
}
