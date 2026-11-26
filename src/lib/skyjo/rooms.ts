import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BOT_BEAT_MS, stepBot } from "@/lib/skyjo/bots";
import { applyAction, createRoom, joinRoom, project } from "@/lib/skyjo/engine";
import type { Action, Room, RoomSnapshot } from "@/lib/skyjo/types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL = 1000 * 60 * 60 * 8;
const FRESH_MS = 5000;
const SEEN_WRITE_MS = 1000;
const BUCKET = "skyjo-rooms";

type Entry = {
  room: Room;
  createdAt: number;
  lastBot: number;
  seen: Record<string, number>;
  left: string[];
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
      const code = randomCode();
      const room = createRoom({ code, hostId: playerId, hostName: name });
      const created = await save(
        code,
        {
          room,
          createdAt: Date.now(),
          lastBot: 0,
          seen: { [playerId]: Date.now() },
          left: [],
        },
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

export function readRoom(code: string, playerId: string, restore = false) {
  return withLock(code, async () => {
    const entry = await load(code);
    if (!entry) return null;
    const stepped = advance(entry);
    const noted = notePresence(entry, playerId, restore);
    if (stepped || noted) await save(code, entry);
    return snapshot(entry, playerId);
  });
}

export function joinRemoteRoom(code: string, playerId: string, name: string) {
  return withLock(code, async () => {
    const entry = await load(code);
    if (!entry) return { error: "Aucune partie avec ce code." as const };
    const step = joinRoom(entry.room, playerId, name);
    if (!step.ok) return { error: step.error ?? "Impossible de rejoindre." };
    entry.room = step.state;
    notePresence(entry, playerId, true);
    await save(code, entry);
    return { snapshot: snapshot(entry, playerId) };
  });
}

export function leaveRoom(code: string, playerId: string) {
  return withLock(code, async () => {
    const entry = await load(code);
    if (!entry) return null;
    const player = entry.room.players.find(
      (seat) => seat.id === playerId && !seat.isBot
    );
    if (!player) return snapshot(entry, playerId);
    if (!entry.left.includes(playerId)) {
      entry.left.push(playerId);
      entry.room.lastEvent = `${player.name} a quitté la partie`;
      entry.room.feed = [...entry.room.feed, entry.room.lastEvent].slice(-8);
      entry.room.revision += 1;
    }
    entry.seen[playerId] = Date.now();
    await save(code, entry);
    return snapshot(entry, playerId);
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
        snapshot: snapshot(entry, playerId),
      };
    }
    const step = applyAction(entry.room, playerId, action);
    if (!step.ok) {
      return {
        error: step.error ?? "Coup refusé.",
        snapshot: snapshot(entry, playerId),
      };
    }
    entry.room = step.state;
    notePresence(entry, playerId, true);
    await save(code, entry);
    return { snapshot: snapshot(entry, playerId) };
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

function notePresence(entry: Entry, playerId: string, restore: boolean) {
  const player = entry.room.players.find(
    (seat) => seat.id === playerId && !seat.isBot
  );
  if (!player) return false;
  const now = Date.now();
  const previous = entry.seen[playerId] ?? 0;
  entry.seen[playerId] = now;
  let changed = now - previous >= SEEN_WRITE_MS;
  if (restore && entry.left.includes(playerId)) {
    entry.left = entry.left.filter((id) => id !== playerId);
    entry.room.lastEvent = `${player.name} est de retour`;
    entry.room.feed = [...entry.room.feed, entry.room.lastEvent].slice(-8);
    entry.room.revision += 1;
    changed = true;
  }
  return changed;
}

function snapshot(entry: Entry, playerId: string): RoomSnapshot {
  const room = entry.room;
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
  const now = Date.now();
  const gone = new Set(entry.left);
  const view = project(room, playerId);
  view.players = view.players.map((player) => {
    const left = !player.isBot && gone.has(player.id);
    const seen = entry.seen[player.id];
    const connected =
      player.isBot || (!left && (seen === undefined || now - seen < FRESH_MS));
    return { ...player, connected, left };
  });
  return { member: true, view };
}

function randomCode() {
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

function database() {
  if (store.__skyjoSupabase) return store.__skyjoSupabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    if (process.env.VERCEL) {
      throw new Error(
        "Le stockage des parties n'est pas configuré sur le serveur."
      );
    }
    return null;
  }
  store.__skyjoSupabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return store.__skyjoSupabase;
}

function ensureBucket(client: SupabaseClient) {
  store.__skyjoBucket ??= client.storage
    .createBucket(BUCKET, { public: false })
    .then(({ error }) => {
      if (!error) return;
      const status = Number(error.status ?? error.statusCode);
      const already =
        status === 409 ||
        ("code" in error && error.code === "ResourceAlreadyExists") ||
        /already exists|duplicate/i.test(error.message);
      if (already) return;
      store.__skyjoBucket = undefined;
      throw new Error(error.message);
    });
  return store.__skyjoBucket;
}

function isMissingObject(error: {
  message: string;
  status?: number;
  statusCode?: string;
  code?: string;
}) {
  if (error.code === "NoSuchBucket" || /bucket/i.test(error.message)) {
    return false;
  }
  if (error.code === "NoSuchKey") return true;
  const status = Number(error.status ?? error.statusCode);
  if (status === 404) return true;
  return /object not found/i.test(error.message);
}

async function load(code: string) {
  const client = database();
  if (!client) return loadMemory(code);
  const found = await readStored(client, code);
  if (found) return found;
  await delay(200);
  return readStored(client, code);
}

function loadMemory(code: string) {
  const entry = memory.get(code);
  if (!entry) return null;
  entry.seen ??= {};
  entry.left ??= [];
  if (Date.now() - entry.createdAt > ROOM_TTL) {
    memory.delete(code);
    return null;
  }
  return entry;
}

async function readStored(client: SupabaseClient, code: string) {
  await ensureBucket(client);
  const { data, error } = await client.storage
    .from(BUCKET)
    .download(
      `${code}.json`,
      { cacheNonce: String(Date.now()) },
      { cache: "no-store" }
    );
  if (error || !data) {
    if (error && isMissingObject(error)) return null;
    throw new Error(error?.message ?? "Lecture de la partie impossible.");
  }

  let raw: Partial<Entry>;
  try {
    raw = JSON.parse(await data.text()) as Partial<Entry>;
  } catch {
    throw new Error("Partie illisible.");
  }
  if (!raw.room || typeof raw.createdAt !== "number") {
    throw new Error("Partie illisible.");
  }
  if (Date.now() - raw.createdAt > ROOM_TTL) {
    await client.storage.from(BUCKET).remove([`${code}.json`]);
    return null;
  }
  return {
    room: raw.room,
    createdAt: raw.createdAt,
    lastBot: raw.lastBot ?? 0,
    seen: raw.seen ?? {},
    left: raw.left ?? [],
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function save(code: string, entry: Entry, fresh = false) {
  const client = database();
  if (!client) {
    if (fresh && memory.has(code)) return false;
    memory.set(code, entry);
    return true;
  }

  await ensureBucket(client);
  const body = new Blob([JSON.stringify(entry)], {
    type: "application/json",
  });
  const { error } = await client.storage
    .from(BUCKET)
    .upload(`${code}.json`, body, {
      upsert: !fresh,
      contentType: "application/json",
      cacheControl: "0",
    });
  if (!error) return true;
  const status = Number(error.status ?? error.statusCode);
  const already =
    status === 409 ||
    ("code" in error && error.code === "ResourceAlreadyExists") ||
    /already exists|duplicate/i.test(error.message);
  if (fresh && already) return false;
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
