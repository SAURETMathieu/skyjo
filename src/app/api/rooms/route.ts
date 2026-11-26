import { createRemoteRoom } from "@/lib/skyjo/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    playerId?: string;
    name?: string;
  } | null;
  if (!body?.playerId || body.playerId.length > 80) {
    return json({ error: "Joueur manquant." }, 400);
  }
  try {
    const snapshot = await createRemoteRoom(body.playerId, body.name ?? "");
    return json({ snapshot });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Création impossible.";
    return json({ error: message }, 503);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}
