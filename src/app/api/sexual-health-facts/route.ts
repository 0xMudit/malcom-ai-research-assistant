import { getRandomSexualHealthFacts } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const facts = await getRandomSexualHealthFacts(requestedLimit);

  return Response.json({ facts });
}
