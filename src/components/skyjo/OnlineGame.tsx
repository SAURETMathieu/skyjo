"use client";

import { useEffect, useRef, useState } from "react";
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

    async function poll() {
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
        setSnapshot((current) => {
          if (
            current?.member &&
            next.member &&
            next.view.revision < current.view.revision
          ) {
            return current;
          }
          return next;
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
      if (!stop) timer = window.setTimeout(() => void poll(), 500);
    }

    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [code, playerId]);

  async function act(action: Action): Promise<GameView | null> {
    const current = snapshotRef.current;
    if (!current?.member) return null;
    setBusy(true);
    try {
      const next = await sendAction(
        code,
        playerId,
        action,
        current.view.revision
      );
      snapshotRef.current = next;
      setSnapshot(next);
      setError(null);
      return next.member ? next.view : null;
    } catch (caught) {
      if (isSnapshotError(caught) && caught.snapshot) {
        snapshotRef.current = caught.snapshot;
        setSnapshot(caught.snapshot);
      }
      setError(caught instanceof Error ? caught.message : "Coup refusé.");
      return null;
    } finally {
      setBusy(false);
    }
  }

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
      onQuit={() => {
        void leaveRemoteRoom(code, playerId)
          .catch(() => undefined)
          .finally(() => router.push("/"));
      }}
      busy={busy}
      error={error}
    />
  );
}
