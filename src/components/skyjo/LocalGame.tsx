"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BOT_BEAT_MS, stepBot } from "@/lib/skyjo/bots";
import { applyAction, createRoom, project } from "@/lib/skyjo/engine";
import { getPlayerId, getSavedName } from "@/lib/skyjo/identity";
import type { Action, BotLevel, GameView, Room } from "@/lib/skyjo/types";
import { GameScreen } from "@/components/skyjo/GameScreen";

const LOCAL_KEY = "skyjo-local-room";

export function LocalGame({ bots, level }: { bots: number; level: BotLevel }) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = useRef(false);
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;

  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
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
  }, [bots, level, router]);

  useEffect(() => {
    if (!room) return;
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(room));
    const next = stepBot(room);
    if (next === room) return;
    const timer = window.setTimeout(() => setRoom(next), BOT_BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [room]);

  if (!room) {
    return (
      <main className="grid min-h-dvh place-items-center text-white">
        Préparation…
      </main>
    );
  }

  const youId = room.players.find((player) => !player.isBot)?.id ?? room.hostId;

  function act(action: Action): GameView | null {
    const current = roomRef.current;
    if (!current) return null;
    const playerId =
      current.players.find((player) => !player.isBot)?.id ?? current.hostId;
    const step = applyAction(current, playerId, action);
    if (!step.ok) {
      setError(step.error ?? "Coup impossible.");
      return null;
    }
    setError(null);
    roomRef.current = step.state;
    setRoom(step.state);
    return project(step.state, playerId);
  }

  return (
    <GameScreen
      view={project(room, youId)}
      onAction={act}
      error={error}
      onQuit={() => {
        sessionStorage.removeItem(LOCAL_KEY);
        router.push("/");
      }}
    />
  );
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
