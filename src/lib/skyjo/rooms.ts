import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BOT_BEAT_MS, stepBot } from "@/lib/skyjo/bots";
import { applyAction, createRoom, joinRoom, project } from "@/lib/skyjo/engine";
import type { Action, Room, RoomSnapshot } from "@/lib/skyjo/types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL = 1000 * 60 * 60 * 8;
const BUCKET = "skyjo-rooms";

type Entry = {
  room: Room;
  createdAt: number;
  lastBot: number;
};

const store = globalThis as typeof globalThis & {
  __skyjoRooms?: Map<string, Entry>;
  __skyjoQueues?: Map<string, Promise<void>>;
  __skyjoSupabase?: SupabaseClient;
  __skyjoBucket?: Promise<void>;
};

const memory = (store.__skyjoRooms ??= new Map<string, Entry>());
const queues = (store.__skyjoQueues ??= new Map<string, Promise<void>>());

export function createRemoteRoom(playerId: string, name: string) {
  return withLock("create", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = await makeCode();
      const room = createRoom({ code, hostId: playerId, hostName: name });
      const created = await save(
        code,
        { room, createdAt: Date.now(), lastBot: 0 },
        true
      );
      if (!created) continue;
      return {
        member: true,
        view: project(room, playerId),
      } satisfies RoomSnapshot;
    }
    throw new Error("Impossible de créer un code.");
  });
}

export function readRoom(code: string, playerId: string) {
  return withLock(code, async () => {
    const entry = await load(code);
    if (!entry) return null;
    if (advance(entry)) await save(code, entry);
    return snapshot(entry.room, playerId);
  });
}

export function joinRemoteRoom(code: string, playerId: string, name: string) {
  return withLock(code, async () => {
    const entry = await load(code);
    if (!entry) return { error: "Aucune partie avec ce code." as const };
    const step = joinRoom(entry.room, playerId, name);
    if (!step.ok) return { error: step.error ?? "Impossible de rejoindre." };
    entry.room = step.state;
    await save(code, entry);
    return { snapshot: snapshot(entry.room, playerId) };
  });
}

export function play(
  code: string,
  playerId: string,
  action: Action,
  revision: number
) {
  return withLock(code, async () => {
    const entry = await load(code);
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
    await save(code, entry);
    return { snapshot: snapshot(entry.room, playerId) };
  });
}

function advance(entry: Entry) {
  const now = Date.now();
  if (now - entry.lastBot < BOT_BEAT_MS) return false;
  const next = stepBot(entry.room);
  if (next === entry.room) return false;
  entry.room = next;
  entry.lastBot = now;
  return true;
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

async function makeCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = "";
    for (let index = 0; index < 4; index += 1) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!(await load(code))) return code;
  }
  throw new Error("Impossible de créer un code.");
}

function database() {
  if (store.__skyjoSupabase) return store.__skyjoSupabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  store.__skyjoSupabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return store.__skyjoSupabase;
}

function ensureBucket(client: SupabaseClient) {
  store.__skyjoBucket ??= client.storage
    .createBucket(BUCKET, { public: false })
    .then(({ error }) => {
      if (!error) return;
      const status = "statusCode" in error ? String(error.statusCode) : "";
      if (status === "409" || /already exists/i.test(error.message)) return;
      store.__skyjoBucket = undefined;
      throw new Error(error.message);
    });
  return store.__skyjoBucket;
}

async function load(code: string) {
  const client = database();
  if (!client) {
    const entry = memory.get(code);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > ROOM_TTL) {
      memory.delete(code);
      return null;
    }
    return entry;
  }

  await ensureBucket(client);
  const { data, error } = await client.storage
    .from(BUCKET)
    .download(`${code}.json`);
  if (error || !data) {
    const status =
      error && "statusCode" in error ? String(error.statusCode) : "";
    if (
      !error ||
      status === "404" ||
      /not found|not_found/i.test(error.message)
    ) {
      return null;
    }
    throw new Error(error.message);
  }

  const entry = JSON.parse(await data.text()) as Entry;
  if (Date.now() - entry.createdAt > ROOM_TTL) {
    await client.storage.from(BUCKET).remove([`${code}.json`]);
    return null;
  }
  return entry;
}

async function save(code: string, entry: Entry, fresh = false) {
  const client = database();
  if (!client) {
    if (fresh && memory.has(code)) return false;
    memory.set(code, entry);
    return true;
  }

  await ensureBucket(client);
  const { error } = await client.storage
    .from(BUCKET)
    .upload(`${code}.json`, Buffer.from(JSON.stringify(entry)), {
      upsert: !fresh,
      contentType: "application/json",
    });
  if (!error) return true;
  if (fresh && /already exists|duplicate/i.test(error.message)) return false;
  throw new Error(error.message);
}

function withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
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
