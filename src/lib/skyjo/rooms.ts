import { after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { stepBot } from "@/lib/skyjo/bots";
import { MIN_PLAYERS } from "@/lib/skyjo/cards";
import {
  applyAction,
  createRoom,
  dismissPlayer,
  joinRoom,
  project,
} from "@/lib/skyjo/engine";
import type { Action, Room, RoomSnapshot } from "@/lib/skyjo/types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL = 1000 * 60 * 60 * 8;
const FRESH_MS = 5000;
const SEEN_WRITE_MS = 3000;
const ONLINE_BOT_BEAT_MS = 450;
const REJOIN_MS = 2 * 60 * 1000;
const BUCKET = "skyjo-rooms";
const TABLE = "skyjo_rooms";

type Entry = {
  room: Room;
  createdAt: number;
  lastBot: number;
  seen: Record<string, number>;
  left: string[];
  leftAt: Record<string, number>;
  version: number;
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
          leftAt: {},
          version: 0,
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const entry = await load(code);
      if (!entry) return null;
      const before = entry.room.revision;
      const expired = expireDeparted(entry);
      const stepped = advance(entry);
      const noted = notePresence(entry, playerId, restore);
      if (!(expired || stepped || noted)) return snapshot(entry, playerId);
      const saved = await commit(code, entry, entry.room.revision !== before);
      if (!saved) continue;
      return snapshot(entry, playerId);
    }
    const latest = await load(code);
    return latest ? snapshot(latest, playerId) : null;
  });
}

export function joinRemoteRoom(code: string, playerId: string, name: string) {
  return withLock(code, async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const entry = await load(code);
      if (!entry) return { error: "Aucune partie avec ce code." as const };
      const before = entry.room.revision;
      const expired = expireDeparted(entry);
      const step = joinRoom(entry.room, playerId, name);
      if (!step.ok) {
        if (expired) {
          const saved = await commit(code, entry, true);
          if (!saved) continue;
        }
        return { error: step.error ?? "Impossible de rejoindre." };
      }
      entry.room = step.state;
      notePresence(entry, playerId, true);
      const saved = await commit(code, entry, entry.room.revision !== before);
      if (!saved) continue;
      return { snapshot: snapshot(entry, playerId) };
    }
    return { error: "La partie a avancé." as const };
  });
}

export function leaveRoom(code: string, playerId: string) {
  return withLock(code, async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const entry = await load(code);
      if (!entry) return null;
      const before = entry.room.revision;
      const expired = expireDeparted(entry);
      const player = entry.room.players.find(
        (seat) => seat.id === playerId && !seat.isBot
      );
      if (!player) {
        if (expired) {
          const saved = await commit(code, entry, true);
          if (!saved) continue;
        }
        return snapshot(entry, playerId);
      }
      if (!entry.left.includes(playerId)) {
        entry.left.push(playerId);
        entry.leftAt[playerId] = Date.now();
        entry.room.lastEvent = `${player.name} a quitté la partie`;
        entry.room.feed = [...entry.room.feed, entry.room.lastEvent].slice(-8);
        entry.room.revision += 1;
      }
      entry.seen[playerId] = Date.now();
      const saved = await commit(code, entry, entry.room.revision !== before);
      if (!saved) continue;
      return snapshot(entry, playerId);
    }
    const latest = await load(code);
    return latest ? snapshot(latest, playerId) : null;
  });
}

export function play(
  code: string,
  playerId: string,
  action: Action,
  revision: number
) {
  return withLock(code, async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const entry = await load(code);
      if (!entry) return { error: "Cette partie n'existe plus." as const };
      const expired = expireDeparted(entry);
      if (
        action.type === "start" &&
        entry.room.phase.kind === "lobby" &&
        playerId === entry.room.hostId &&
        seatedPlayers(entry, playerId).length < MIN_PLAYERS
      ) {
        return { error: "Il faut au moins 2 joueurs." as const };
      }
      const openingFlip =
        action.type === "flip" && entry.room.phase.kind === "opening";
      if (!openingFlip && entry.room.revision !== revision) {
        if (expired) {
          const saved = await commit(code, entry, true);
          if (!saved) continue;
        }
        return {
          error: "La partie a avancé." as const,
          snapshot: snapshot(entry, playerId),
        };
      }
      const undoDeparture = dropDepartedForStart(entry, playerId, action);
      const step = applyAction(entry.room, playerId, action);
      if (!step.ok) {
        undoDeparture();
        if (expired) {
          const saved = await commit(code, entry, true);
          if (!saved) continue;
        }
        return {
          error: step.error ?? "Coup refusé.",
          snapshot: snapshot(entry, playerId),
        };
      }
      entry.room = step.state;
      notePresence(entry, playerId, true);
      const saved = await commit(code, entry, true);
      if (!saved) continue;
      return { snapshot: snapshot(entry, playerId) };
    }
    const latest = await load(code);
    if (!latest) return { error: "Cette partie n'existe plus." as const };
    return {
      error: "La partie a avancé." as const,
      snapshot: snapshot(latest, playerId),
    };
  });
}

function advance(entry: Entry) {
  const now = Date.now();
  if (now - entry.lastBot < ONLINE_BOT_BEAT_MS) return false;
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
    delete entry.leftAt[playerId];
    entry.room.lastEvent = `${player.name} est de retour`;
    entry.room.feed = [...entry.room.feed, entry.room.lastEvent].slice(-8);
    entry.room.revision += 1;
    changed = true;
  }
  return changed;
}

function expireDeparted(entry: Entry) {
  const phase = entry.room.phase.kind;
  if (phase === "lobby" || phase === "over") return false;
  const now = Date.now();
  let changed = false;
  for (const id of [...entry.left]) {
    const since = entry.leftAt[id] ?? entry.seen[id] ?? now;
    if (now - since < REJOIN_MS) continue;
    const seat = entry.room.players.some((player) => player.id === id);
    if (seat && !dismissPlayer(entry.room, id)) continue;
    entry.left = entry.left.filter((playerId) => playerId !== id);
    delete entry.leftAt[id];
    delete entry.seen[id];
    changed = true;
  }
  return changed;
}

function seatedPlayers(entry: Entry, actorId: string) {
  const gone = new Set(entry.left);
  gone.delete(actorId);
  return entry.room.players.filter((player) => !gone.has(player.id));
}

function dropDepartedForStart(entry: Entry, actorId: string, action: Action) {
  if (
    action.type !== "start" ||
    entry.room.phase.kind !== "lobby" ||
    actorId !== entry.room.hostId
  ) {
    return () => undefined;
  }
  const players = entry.room.players;
  const left = entry.left;
  const leftAt = entry.leftAt;
  const seen = entry.seen;
  const revision = entry.room.revision;
  const lastEvent = entry.room.lastEvent;
  const feed = entry.room.feed;
  dropDeparted(entry, actorId);
  return () => {
    entry.room.players = players;
    entry.left = left;
    entry.leftAt = leftAt;
    entry.seen = seen;
    entry.room.revision = revision;
    entry.room.lastEvent = lastEvent;
    entry.room.feed = feed;
  };
}

function dropDeparted(entry: Entry, actorId: string) {
  const gone = new Set(entry.left);
  gone.delete(actorId);
  const removed = entry.room.players.filter((player) => gone.has(player.id));
  if (removed.length === 0) return;
  entry.room.players = entry.room.players.filter(
    (player) => !gone.has(player.id)
  );
  entry.left = entry.left.filter((id) => !gone.has(id));
  for (const player of removed) {
    delete entry.leftAt[player.id];
    delete entry.seen[player.id];
  }
  const names = removed.map((player) => player.name).join(", ");
  const message =
    removed.length > 1 ? `${names} ne jouent pas` : `${names} ne joue pas`;
  entry.room.lastEvent = message;
  entry.room.feed = [...entry.room.feed, message].slice(-8);
  entry.room.revision += 1;
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
  if (view.phase === "lobby") {
    const active = view.players.filter((player) => !player.left).length;
    view.actions.start = view.youAreHost && active >= MIN_PLAYERS;
    view.hint =
      active < MIN_PLAYERS
        ? "Ajoute un bot ou attends un joueur"
        : "L'hôte peut lancer la partie";
  }
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
  const stored = await readTable(client, code);
  if (stored) return stored;
  const legacy = await readLegacy(client, code);
  if (!legacy) return null;
  legacy.version = 0;
  const inserted = await save(code, legacy, true);
  if (inserted) return legacy;
  return readTable(client, code);
}

function loadMemory(code: string) {
  const entry = memory.get(code);
  if (!entry) return null;
  normalizePresence(entry);
  if (Date.now() - entry.createdAt > ROOM_TTL) {
    memory.delete(code);
    return null;
  }
  return entry;
}

async function readLegacy(client: SupabaseClient, code: string) {
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
  return normalizePresence({
    room: raw.room,
    createdAt: raw.createdAt,
    lastBot: raw.lastBot ?? 0,
    seen: raw.seen ?? {},
    left: raw.left ?? [],
    leftAt: raw.leftAt ?? {},
    version: raw.version ?? 0,
  });
}

function normalizePresence(entry: Entry) {
  entry.seen ??= {};
  entry.left ??= [];
  entry.leftAt ??= {};
  entry.version ??= 0;
  for (const id of entry.left) {
    if (typeof entry.leftAt[id] !== "number") {
      entry.leftAt[id] = entry.seen[id] ?? Date.now();
    }
  }
  return entry;
}

async function readTable(client: SupabaseClient, code: string) {
  const { data, error } = await client
    .from(TABLE)
    .select("payload, version")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data.payload as Partial<Entry>;
  if (!raw.room || typeof raw.createdAt !== "number") {
    throw new Error("Partie illisible.");
  }
  if (Date.now() - raw.createdAt > ROOM_TTL) {
    await client.from(TABLE).delete().eq("code", code);
    return null;
  }
  return normalizePresence({
    room: raw.room,
    createdAt: raw.createdAt,
    lastBot: raw.lastBot ?? 0,
    seen: raw.seen ?? {},
    left: raw.left ?? [],
    leftAt: raw.leftAt ?? {},
    version: Number(data.version) || 0,
  });
}

async function save(code: string, entry: Entry, fresh = false) {
  const client = database();
  if (!client) {
    if (fresh && memory.has(code)) return false;
    entry.version = (entry.version ?? 0) + 1;
    memory.set(code, entry);
    return true;
  }

  if (fresh) {
    entry.version = 1;
    const { error } = await client.from(TABLE).insert({
      code,
      payload: entry,
      version: 1,
    });
    if (!error) return true;
    if (
      error.code === "23505" ||
      /duplicate|already exists/i.test(error.message)
    ) {
      return false;
    }
    throw new Error(error.message);
  }

  const current = entry.version ?? 0;
  const next = current + 1;
  entry.version = next;
  const { data, error } = await client
    .from(TABLE)
    .update({
      payload: entry,
      version: next,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code)
    .eq("version", current)
    .select("version");
  if (error) {
    entry.version = current;
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    entry.version = current;
    return false;
  }
  return true;
}

async function commit(code: string, entry: Entry, notify: boolean) {
  const saved = await save(code, entry, false);
  if (saved && notify) publishRoom(code, entry.room.revision);
  return saved;
}

function publishRoom(code: string, revision: number) {
  const run = () => sendRevision(code, revision);
  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}

async function sendRevision(code: string, revision: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `skyjo:${code}`,
          event: "updated",
          payload: { revision },
        },
      ],
    }),
  }).catch(() => undefined);
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
