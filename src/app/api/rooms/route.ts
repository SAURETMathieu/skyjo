import { createRemoteRoom } from "@/lib/skyjo/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    playerId?: string;
    name?: string;
  } | null;
  if (!body?.playerId || body.playerId.length > 80) {
    return Response.json({ error: "Joueur manquant." }, { status: 400 });
  }
  const snapshot = await createRemoteRoom(body.playerId, body.name ?? "");
  return Response.json({ snapshot });
}
