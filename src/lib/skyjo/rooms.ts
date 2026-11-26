import { BOT_BEAT_MS, stepBot } from "@/lib/skyjo/bots";
import { applyAction, createRoom, joinRoom, project } from "@/lib/skyjo/engine";
import type { Action, Room, RoomSnapshot } from "@/lib/skyjo/types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL = 1000 * 60 * 60 * 8;

type Entry = {
  room: Room;
  createdAt: number;
  lastBot: number;
};

const store = globalThis as typeof globalThis & {
  __skyjoRooms?: Map<string, Entry>;
  __skyjoQueues?: Map<string, Promise<void>>;
};

const rooms = (store.__skyjoRooms ??= new Map<string, Entry>());
const queues = (store.__skyjoQueues ??= new Map<string, Promise<void>>());

export function createRemoteRoom(playerId: string, name: string) {
  return withLock("create", () => {
    purge();
    const code = makeCode();
    const room = createRoom({ code, hostId: playerId, hostName: name });
    rooms.set(code, { room, createdAt: Date.now(), lastBot: 0 });
    return {
      member: true,
      view: project(room, playerId),
    } satisfies RoomSnapshot;
  });
}

export function readRoom(code: string, playerId: string) {
  return withLock(code, () => {
    const entry = rooms.get(code);
    if (!entry) return null;
    advance(entry);
    return snapshot(entry.room, playerId);
  });
}

export function joinRemoteRoom(code: string, playerId: string, name: string) {
  return withLock(code, () => {
    const entry = rooms.get(code);
    if (!entry) return { error: "Aucune partie avec ce code." as const };
    const step = joinRoom(entry.room, playerId, name);
    if (!step.ok) return { error: step.error ?? "Impossible de rejoindre." };
    entry.room = step.state;
    return { snapshot: snapshot(entry.room, playerId) };
  });
}

export function play(
  code: string,
  playerId: string,
  action: Action,
  revision: number
) {
  return withLock(code, () => {
    const entry = rooms.get(code);
    if (!entry) return { error: "Cette partie n'existe plus." as const };
    const openingFlip =
      action.type === "flip" && entry.room.phase.kind === "opening";
    if (!openingFlip && entry.room.revision !== revision) {
      return {
        error: "La partie a avancé." as const,
        snapshot: snapshot(entry.room, playerId),
      };
    }
    const step = applyAction(entry.room, playerId, action);
    if (!step.ok) {
      return {
        error: step.error ?? "Coup refusé.",
        snapshot: snapshot(entry.room, playerId),
      };
    }
    entry.room = step.state;
    return { snapshot: snapshot(entry.room, playerId) };
  });
}

function advance(entry: Entry) {
  const now = Date.now();
  if (now - entry.lastBot < BOT_BEAT_MS) return;
  const next = stepBot(entry.room);
  if (next === entry.room) return;
  entry.room = next;
  entry.lastBot = now;
}

function snapshot(room: Room, playerId: string): RoomSnapshot {
  if (!room.players.some((player) => player.id === playerId)) {
    return {
      member: false,
      code: room.code,
      phase: room.phase.kind,
      hostId: room.hostId,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        isBot: player.isBot,
      })),
    };
  }
  return { member: true, view: project(room, playerId) };
}

function makeCode(): string {
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return rooms.has(code) ? makeCode() : code;
}

function purge() {
  const now = Date.now();
  for (const [code, entry] of rooms) {
    if (now - entry.createdAt > ROOM_TTL) rooms.delete(code);
  }
}

function withLock<T>(code: string, fn: () => T): Promise<T> {
  const previous = queues.get(code) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => fn());
  queues.set(
    code,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}
