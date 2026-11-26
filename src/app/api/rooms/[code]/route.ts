import { joinRemoteRoom, leaveRoom, play, readRoom } from "@/lib/skyjo/rooms";
import type { Action, BotLevel } from "@/lib/skyjo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { kind: "join"; playerId?: string; name?: string }
  | { kind: "leave"; playerId?: string }
  | { kind: "play"; playerId?: string; revision?: number; action?: Action };

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId") ?? "";
  const snapshot = await readRoom(
    normalize(code),
    playerId,
    url.searchParams.get("back") === "1"
  );
  if (!snapshot) {
    return Response.json(
      { error: "Aucune partie avec ce code." },
      { status: 404 }
    );
  }
  return Response.json({ snapshot });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const playerId = cleanId(body?.playerId);
  if (!playerId) {
    return Response.json({ error: "Joueur manquant." }, { status: 400 });
  }

  if (body?.kind === "join") {
    const result = await joinRemoteRoom(
      normalize(code),
      playerId,
      body.name ?? ""
    );
    if ("error" in result && !("snapshot" in result)) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ snapshot: result.snapshot });
  }

  if (body?.kind === "leave") {
    const snapshot = await leaveRoom(normalize(code), playerId);
    if (!snapshot) {
      return Response.json(
        { error: "Aucune partie avec ce code." },
        { status: 404 }
      );
    }
    return Response.json({ snapshot });
  }

  if (body?.kind === "play") {
    const action = parseAction(body.action);
    if (!action || typeof body.revision !== "number") {
      return Response.json({ error: "Coup invalide." }, { status: 400 });
    }
    const result = await play(normalize(code), playerId, action, body.revision);
    if ("error" in result) {
      const snapshot = "snapshot" in result ? result.snapshot : undefined;
      return Response.json(
        { error: result.error, snapshot },
        { status: snapshot ? 409 : 400 }
      );
    }
    return Response.json({ snapshot: result.snapshot });
  }

  return Response.json({ error: "Requête invalide." }, { status: 400 });
}

function readLevel(value: unknown): BotLevel {
  return value === "easy" || value === "normal" || value === "hard"
    ? value
    : "normal";
}

function parseAction(value: Action | undefined): Action | null {
  if (!value || typeof value !== "object") return null;
  switch (value.type) {
    case "add-bot":
      return { type: "add-bot", level: readLevel(value.level) };
    case "start":
    case "draw":
    case "take-discard":
    case "discard-drawn":
    case "next-round":
      return { type: value.type };
    case "remove-bot":
      return typeof value.playerId === "string"
        ? { type: "remove-bot", playerId: value.playerId }
        : null;
    case "flip":
    case "swap":
      return Number.isInteger(value.index)
        ? { type: value.type, index: value.index }
        : null;
    default:
      return null;
  }
}

function normalize(code: string) {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function cleanId(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length < 80
    ? value
    : "";
}
