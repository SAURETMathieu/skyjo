"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BOT_BEAT_MS, stepBot } from "@/lib/skyjo/bots";
import { applyAction, createRoom, project } from "@/lib/skyjo/engine";
import { getPlayerId, getSavedName } from "@/lib/skyjo/identity";
import type {
  Action,
  BotLevel,
  GameView,
  Room,
  RoundScore,
  Slot,
} from "@/lib/skyjo/types";
import { GameScreen } from "@/components/skyjo/GameScreen";

const LOCAL_KEY = "skyjo-local-room";

export function LocalGame({
  bots,
  level,
  preview = null,
}: {
  bots: number;
  level: BotLevel;
  preview?: "manche" | "partie" | null;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = useRef(false);
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;

  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    if (preview) {
      setRoom(previewRoom(getSavedName() || "Toi", preview));
      return;
    }
    const saved = sessionStorage.getItem(LOCAL_KEY);
    if (saved) {
      try {
        setRoom(JSON.parse(saved) as Room);
        return;
      } catch {
        sessionStorage.removeItem(LOCAL_KEY);
      }
    }
    if (bots < 1) {
      router.replace("/");
      return;
    }
    setRoom(createLocalRoom(getSavedName() || "Toi", bots, level));
  }, [bots, level, preview, router]);

  useEffect(() => {
    if (!room || preview) return;
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(room));
    const next = stepBot(room);
    if (next === room) return;
    const timer = window.setTimeout(() => setRoom(next), BOT_BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [preview, room]);

  const youId =
    room?.players.find((player) => !player.isBot)?.id ?? room?.hostId ?? "";
  const view = useMemo(
    () => (room ? project(room, youId) : null),
    [room, youId]
  );
  const act = useCallback((action: Action): GameView | null => {
    const current = roomRef.current;
    if (!current) return null;
    const playerId =
      current.players.find((player) => !player.isBot)?.id ?? current.hostId;
    const step = applyAction(current, playerId, action);
    if (!step.ok) {
      setError(step.error ?? "Coup impossible.");
      return null;
    }
    setError((existing) => (existing === null ? existing : null));
    roomRef.current = step.state;
    setRoom(step.state);
    return project(step.state, playerId);
  }, []);
  const refresh = useCallback(() => {
    window.location.reload();
  }, []);
  const quit = useCallback(() => {
    if (!preview) sessionStorage.removeItem(LOCAL_KEY);
    router.push("/");
  }, [preview, router]);

  if (!room || !view) {
    return (
      <main className="grid min-h-dvh place-items-center text-white">
        Préparation…
      </main>
    );
  }

  return (
    <GameScreen
      view={view}
      onAction={act}
      error={error}
      onQuit={quit}
      onRefresh={refresh}
    />
  );
}

function previewRoom(name: string, preview: "manche" | "partie"): Room {
  const you = getPlayerId();
  const players = [
    { id: you, name, total: 28 },
    { id: "bot-1", name: "Léo", total: 6 },
    { id: "bot-3", name: "Noé", total: 19 },
    { id: "bot-2", name: "Mia", total: 41 },
  ];
  const summary: RoundScore[] = [
    {
      playerId: "bot-1",
      name: "Léo",
      raw: 2,
      points: 2,
      doubled: false,
      total: 6,
    },
    {
      playerId: "bot-3",
      name: "Noé",
      raw: 9,
      points: 9,
      doubled: false,
      total: 19,
    },
    {
      playerId: you,
      name,
      raw: 7,
      points: 14,
      doubled: true,
      total: 28,
    },
    {
      playerId: "bot-2",
      name: "Mia",
      raw: 16,
      points: 16,
      doubled: false,
      total: 41,
    },
  ];
  return {
    code: "LOCAL",
    hostId: you,
    revision: 1,
    seq: 1,
    players: players.map((player, index) => ({
      id: player.id,
      name: player.name,
      isBot: player.id !== you,
      total: player.total,
      grid: previewGrid(index),
    })),
    deck: [],
    discard: [],
    current: 0,
    phase: { kind: preview === "partie" ? "over" : "between" },
    round: 2,
    closerId: you,
    pending: [],
    lastRound: false,
    summary,
    uncovered: [],
    exchange: null,
    placed: null,
    lastEvent: "",
    feed: [],
  };
}

function previewGrid(seed: number): Slot[] {
  return Array.from({ length: 12 }, (_, index) => {
    if (index % 4 === seed % 4) return null;
    return {
      id: `preview-${seed}-${index}`,
      value: ((seed + index) % 13) - 2,
      faceUp: true,
    };
  });
}

function createLocalRoom(name: string, bots: number, level: BotLevel) {
  let state = createRoom({
    code: "LOCAL",
    hostId: getPlayerId(),
    hostName: name,
  });
  for (let index = 0; index < bots; index += 1) {
    const added = applyAction(state, state.hostId, {
      type: "add-bot",
      level,
    });
    if (added.ok) state = added.state;
  }
  const started = applyAction(state, state.hostId, { type: "start" });
  return started.ok ? started.state : state;
}
