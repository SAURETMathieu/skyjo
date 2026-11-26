"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getPlayerId, getSavedName, saveName } from "@/lib/skyjo/identity";
import {
  fetchRoom,
  isSnapshotError,
  joinRemoteRoom,
  leaveRemoteRoom,
  sendAction,
} from "@/lib/skyjo/remote";
import type { Action, GameView, RoomSnapshot } from "@/lib/skyjo/types";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { GameScreen } from "@/components/skyjo/GameScreen";

export function OnlineGame({ code }: { code: string }) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState("");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const wasMember = useRef(false);
  if (snapshot?.member) wasMember.current = true;

  useEffect(() => {
    setPlayerId(getPlayerId());
    setName(getSavedName());
  }, []);

  useEffect(() => {
    if (!playerId) return;
    let stop = false;
    let timer = 0;
    let announced = false;
    let misses = 0;
    let live = false;
    let pulling = false;
    let again = false;
    const supabase = hasSupabaseEnv() ? createClient() : null;
    const channel = supabase
      ? supabase
          .channel(`skyjo:${code}`)
          .on("broadcast", { event: "updated" }, (message) => {
            const revision = revisionOf(message.payload);
            const current = snapshotRef.current;
            if (
              current?.member &&
              revision !== null &&
              revision <= current.view.revision
            ) {
              return;
            }
            void pull();
          })
          .subscribe((status) => {
            live = status === "SUBSCRIBED";
          })
      : null;

    refreshRef.current = pull;

    async function pull() {
      if (stop) return;
      if (pulling) {
        again = true;
        return;
      }
      pulling = true;
      try {
        do {
          again = false;
          const back = !announced;
          try {
            const next = await fetchRoom(code, playerId, back);
            if (stop) return;
            announced = true;
            misses = 0;
            setMissing(false);
            setError((current) =>
              current === "Aucune partie avec ce code." ? null : current
            );
            setSnapshot((shown) => {
              const kept = keepSnapshot(shown, next);
              snapshotRef.current = kept;
              return kept;
            });
          } catch (caught) {
            if (stop) return;
            const message =
              caught instanceof Error ? caught.message : "Partie introuvable.";
            if (message === "Aucune partie avec ce code.") {
              misses += 1;
              if (misses >= 3 && !snapshotRef.current) {
                setError(message);
                setMissing(true);
              }
            } else {
              misses = 0;
              setError(message);
            }
          }
        } while (again && !stop);
      } finally {
        pulling = false;
      }
    }

    function wait() {
      const current = snapshotRef.current;
      if (current?.member) {
        const bot =
          current.view.phase === "opening"
            ? current.view.players.some((player) => player.isBot)
            : current.view.players.some(
                (player) => player.isBot && player.current
              );
        if (bot) return 500;
      }
      return live ? 2000 : 700;
    }

    async function tick() {
      await pull();
      if (stop) return;
      timer = window.setTimeout(() => void tick(), wait());
    }

    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [code, playerId]);

  const pending = useRef(false);
  const act = useCallback(
    async (action: Action): Promise<GameView | null> => {
      if (pending.current) return null;
      const current = snapshotRef.current;
      if (!current?.member) return null;
      pending.current = true;
      try {
        const next = await sendAction(
          code,
          playerId,
          action,
          current.view.revision
        );
        let view: GameView | null = null;
        setSnapshot((shown) => {
          const kept = keepSnapshot(shown, next);
          snapshotRef.current = kept;
          view = kept.member ? kept.view : null;
          return kept;
        });
        setError((existing) => (existing === null ? existing : null));
        return view;
      } catch (caught) {
        if (isSnapshotError(caught) && caught.snapshot) {
          const failed = caught.snapshot;
          setSnapshot((shown) => {
            const kept = keepSnapshot(shown, failed);
            snapshotRef.current = kept;
            return kept;
          });
        }
        setError(caught instanceof Error ? caught.message : "Coup refusé.");
        return null;
      } finally {
        pending.current = false;
      }
    },
    [code, playerId]
  );
  const refresh = useCallback(() => refreshRef.current(), []);
  const quit = useCallback(() => {
    void leaveRemoteRoom(code, playerId)
      .catch(() => undefined)
      .finally(() => router.push("/"));
  }, [code, playerId, router]);

  async function join() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Entre ton prénom.");
      return;
    }
    saveName(trimmed);
    setBusy(true);
    try {
      const next = await joinRemoteRoom(code, playerId, trimmed);
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Impossible de rejoindre."
      );
    } finally {
      setBusy(false);
    }
  }

  if (missing && !snapshot) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-lg place-items-center px-6 text-center text-white">
        <div>
          <p className="text-xl font-extrabold">Partie introuvable</p>
          <p className="mt-2 text-white/70">{error}</p>
          <button
            type="button"
            className="mt-6 font-bold text-amber-200"
            onClick={() => router.push("/")}
          >
            Retour
          </button>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center text-white">
        <div>
          <p>Connexion…</p>
          {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
        </div>
      </main>
    );
  }

  if (!snapshot.member && wasMember.current) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-lg place-items-center px-6 text-center text-white">
        <div>
          <p className="text-xl font-extrabold">
            Tu n’es plus dans cette partie
          </p>
          <p className="mt-2 text-white/70">
            Le délai de 2 minutes pour revenir est dépassé.
          </p>
          <button
            type="button"
            className="mt-6 font-bold text-amber-200"
            onClick={() => router.push("/")}
          >
            Retour
          </button>
        </div>
      </main>
    );
  }

  if (!snapshot.member) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 text-white">
        <p className="text-center text-sm text-white/60">Rejoindre</p>
        <h1 className="text-center text-5xl font-extrabold tracking-[0.28em]">
          {code}
        </h1>
        <p className="mt-3 text-center text-white/70">
          {snapshot.players.length} joueur
          {snapshot.players.length > 1 ? "s" : ""} à la table
        </p>
        <input
          value={name}
          maxLength={18}
          onChange={(event) => setName(event.target.value)}
          className="mt-6 h-12 rounded-2xl bg-white/10 px-4 text-lg font-bold outline-none"
          placeholder="Ton prénom"
        />
        {error ? (
          <p className="mt-3 text-center text-sm text-rose-200">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={busy || snapshot.phase !== "lobby"}
          onClick={() => void join()}
          className="mt-4 h-14 rounded-2xl bg-amber-300 text-lg font-extrabold text-[#1a1405] disabled:opacity-40"
        >
          {snapshot.phase === "lobby" ? "Rejoindre" : "Partie déjà lancée"}
        </button>
      </main>
    );
  }

  return (
    <GameScreen
      view={snapshot.view}
      onAction={act}
      onQuit={quit}
      onRefresh={refresh}
      busy={busy}
      error={error}
    />
  );
}

function revisionOf(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("revision" in payload)) {
    return null;
  }
  const revision = payload.revision;
  return typeof revision === "number" ? revision : null;
}

function keepSnapshot(shown: RoomSnapshot | null, next: RoomSnapshot) {
  if (!shown) return next;
  if (shown.member && next.member) {
    if (next.view.revision < shown.view.revision) return shown;
    if (
      next.view.revision === shown.view.revision &&
      viewKey(shown.view) === viewKey(next.view)
    ) {
      return shown;
    }
    return next;
  }
  if (!shown.member && !next.member && lobbyKey(shown) === lobbyKey(next)) {
    return shown;
  }
  return next;
}

function lobbyKey(snapshot: Extract<RoomSnapshot, { member: false }>) {
  return `${snapshot.phase}:${snapshot.hostId}:${snapshot.players
    .map((player) => `${player.id}:${player.name}:${player.isBot ? 1 : 0}`)
    .join(",")}`;
}

function viewKey(view: GameView) {
  let players = "";
  for (const player of view.players) {
    players += `${player.id}:${player.connected ? 1 : 0}:${player.left ? 1 : 0}:${player.current ? 1 : 0}:${player.total}:${player.visible}:${player.hidden}:`;
    for (const cell of player.grid) {
      players += cell.empty ? "e" : cell.faceUp ? `u${cell.value ?? ""}` : "d";
      players += ",";
    }
    players += ";";
  }
  const actions = view.actions;
  return [
    view.phase,
    view.round,
    view.yourTurn ? 1 : 0,
    view.lastRound ? 1 : 0,
    view.deckCount,
    view.discardTop ?? "",
    view.hand ?? "",
    view.opponentHand ?? "",
    view.opponentHolding ? 1 : 0,
    view.holdFromDeck ? 1 : 0,
    view.currentPlayerId ?? "",
    view.closerId ?? "",
    view.hint,
    view.lastEvent,
    view.flipsNeeded,
    actions.flip ? 1 : 0,
    actions.draw ? 1 : 0,
    actions.takeDiscard ? 1 : 0,
    actions.swap ? 1 : 0,
    actions.discardDrawn ? 1 : 0,
    actions.nextRound ? 1 : 0,
    actions.start ? 1 : 0,
    actions.addBot ? 1 : 0,
    view.winners.join(","),
    view.summary
      ?.map(
        (score) => `${score.playerId}:${score.points}:${score.doubled ? 1 : 0}`
      )
      .join(",") ?? "",
    (view.uncovered ?? [])
      .map((card) => `${card.playerId}:${card.index}:${card.value}`)
      .join(","),
    players,
  ].join("|");
}
