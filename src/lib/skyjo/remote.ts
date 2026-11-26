import type { Action, GameView, RoomSnapshot } from "@/lib/skyjo/types";

type ErrorWithSnapshot = Error & { snapshot?: RoomSnapshot };

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: RoomSnapshot;
    view?: GameView;
  };
  if (!response.ok) {
    const error = new Error(
      body.error ?? "La partie est indisponible."
    ) as ErrorWithSnapshot;
    error.snapshot = body.snapshot;
    throw error;
  }
  return body;
}

export async function createRemoteRoom(playerId: string, name: string) {
  const body = await request("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ playerId, name }),
  });
  if (!body.snapshot || !body.snapshot.member) {
    throw new Error("Impossible de créer la partie.");
  }
  return body.snapshot.view;
}

export async function fetchRoom(code: string, playerId: string, back = false) {
  const backQuery = back ? "&back=1" : "";
  const body = await request(
    `/api/rooms/${code}?playerId=${encodeURIComponent(playerId)}${backQuery}`
  );
  if (!body.snapshot) throw new Error("Partie introuvable.");
  return body.snapshot;
}

export async function joinRemoteRoom(
  code: string,
  playerId: string,
  name: string
) {
  const body = await request(`/api/rooms/${code}`, {
    method: "POST",
    body: JSON.stringify({ kind: "join", playerId, name }),
  });
  if (!body.snapshot?.member) throw new Error("Impossible de rejoindre.");
  return body.snapshot;
}

export async function leaveRemoteRoom(code: string, playerId: string) {
  await request(`/api/rooms/${code}`, {
    method: "POST",
    body: JSON.stringify({ kind: "leave", playerId }),
    keepalive: true,
  });
}

export async function sendAction(
  code: string,
  playerId: string,
  action: Action,
  revision: number
) {
  const body = await request(`/api/rooms/${code}`, {
    method: "POST",
    body: JSON.stringify({ kind: "play", playerId, action, revision }),
  });
  if (!body.snapshot) throw new Error("Coup ignoré.");
  return body.snapshot;
}

export function isSnapshotError(error: unknown): error is ErrorWithSnapshot {
  return error instanceof Error;
}
