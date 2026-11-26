"use client";

import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ArrowRight, Bot, Copy, Minus, Plus, Share2 } from "lucide-react";

import type { Action, GameView, ViewPlayer } from "@/lib/skyjo/types";
import { CardFace } from "@/components/skyjo/CardFace";

export function GameScreen({
  view,
  onAction,
  onQuit,
  busy = false,
  error,
}: {
  view: GameView;
  onAction: (action: Action) => void;
  onQuit: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  if (view.phase === "lobby") {
    return (
      <Lobby
        view={view}
        onAction={onAction}
        onQuit={onQuit}
        busy={busy}
        error={error}
      />
    );
  }
  if (view.phase === "between" || view.phase === "over") {
    return (
      <Summary view={view} onAction={onAction} onQuit={onQuit} busy={busy} />
    );
  }
  return (
    <Board
      view={view}
      onAction={onAction}
      onQuit={onQuit}
      busy={busy}
      error={error}
    />
  );
}

function Shell({
  children,
  onQuit,
  felt = false,
  status,
  yours = false,
}: {
  children: ReactNode;
  onQuit: () => void;
  felt?: boolean;
  status?: string;
  yours?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <main
      className={`relative mx-auto flex h-dvh w-full max-w-lg flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white ${
        felt ? "skyjo-table" : ""
      }`}
    >
      <div className="mb-2 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p className="text-lg font-extrabold tracking-tight">Skyjo</p>
        {status ? (
          <p
            className={`justify-self-center rounded-full px-3 py-1 text-sm font-extrabold ${
              yours
                ? "bg-amber-300 text-[#1a1405]"
                : "bg-white/10 text-white/80"
            }`}
          >
            {status}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="justify-self-end rounded-full px-3 py-2 text-sm text-white/75"
          onClick={() => setConfirm(true)}
        >
          Quitter
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      {confirm ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/65 px-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-title"
            className="w-full max-w-xs rounded-3xl bg-[#0b3a28] p-5 text-center shadow-2xl ring-1 ring-white/15"
          >
            <p id="quit-title" className="text-lg font-extrabold">
              Quitter la partie ?
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-12 rounded-2xl bg-white/10 font-extrabold"
                onClick={() => setConfirm(false)}
              >
                Non
              </button>
              <button
                type="button"
                className="h-12 rounded-2xl bg-amber-300 font-extrabold text-[#1a1405]"
                onClick={onQuit}
              >
                Oui
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Lobby({
  view,
  onAction,
  onQuit,
  busy,
  error,
}: {
  view: GameView;
  onAction: (action: Action) => void;
  onQuit: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const link =
    typeof window === "undefined"
      ? view.code
      : `${window.location.origin}/partie/${view.code}`;

  async function share() {
    const payload = {
      title: "Skyjo",
      text: `Rejoins ma partie Skyjo : ${view.code}`,
      url: link,
    };
    if (navigator.share) {
      await navigator.share(payload).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <Shell onQuit={onQuit}>
      <p className="text-center text-sm text-white/60">Code de la partie</p>
      <p className="mt-1 text-center text-5xl font-extrabold tracking-[0.28em]">
        {view.code}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void share()}
        >
          <Share2 className="size-4" />
          Partager
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            void navigator.clipboard.writeText(view.code);
            setCopied(true);
          }}
        >
          <Copy className="size-4" />
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <ul className="mt-6 flex flex-col gap-2">
        {view.players.map((player) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
          >
            <span className="flex items-center gap-2 font-bold">
              {player.isBot ? <Bot className="size-4" /> : null}
              {player.name}
              {player.id === view.hostId ? (
                <span className="text-xs font-semibold text-amber-200">
                  Hôte
                </span>
              ) : null}
            </span>
            {view.youAreHost && player.isBot ? (
              <button
                type="button"
                aria-label={`Retirer ${player.name}`}
                className="rounded-full bg-white/10 p-2"
                onClick={() =>
                  onAction({ type: "remove-bot", playerId: player.id })
                }
              >
                <Minus className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {view.youAreHost ? (
        <button
          type="button"
          className={`${secondaryButton} mt-3`}
          disabled={!view.actions.addBot || busy}
          onClick={() => onAction({ type: "add-bot" })}
        >
          <Plus className="size-4" />
          Ajouter un bot
        </button>
      ) : (
        <p className="mt-4 text-center text-sm text-white/60">
          En attente de l’hôte…
        </p>
      )}
      <p className="mt-4 min-h-5 text-center text-sm text-amber-100">
        {view.hint}
      </p>
      {error ? (
        <p className="text-center text-sm text-rose-200">{error}</p>
      ) : null}
      {view.youAreHost ? (
        <button
          type="button"
          className={`${primaryButton} mt-auto`}
          disabled={!view.actions.start || busy}
          onClick={() => onAction({ type: "start" })}
        >
          Lancer la partie
        </button>
      ) : null}
    </Shell>
  );
}

function Board({
  view,
  onAction,
  onQuit,
  busy,
  error,
}: {
  view: GameView;
  onAction: (action: Action) => void;
  onQuit: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const you = view.players.find((player) => player.isYou);
  const others = view.players.filter((player) => !player.isYou);

  const current = view.players.find((player) => player.current);
  const spotlight = view.phase !== "opening";
  const holding = view.hand !== null || view.opponentHolding;
  const revealedHold = view.hand ?? view.opponentHand;
  const drawn = holding && view.holdFromDeck;
  const taken = holding && !view.holdFromDeck;
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);

  useLayoutEffect(() => {
    const list = listRef.current;
    const bottom = bottomRef.current;
    const frame = list?.parentElement;
    if (!list || !bottom || !frame) return;

    const measure = () => {
      const card = list.querySelector("article");
      if (!card || others.length < 2) {
        setRows(1);
        return;
      }
      const styles = getComputedStyle(list);
      const gap = Number.parseFloat(styles.columnGap) || 8;
      const pad =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const cardBox = card.getBoundingClientRect();
      const columns = Math.max(
        1,
        Math.floor((list.clientWidth - pad + gap) / (cardBox.width + gap))
      );
      const twoRows =
        cardBox.height * 2 + gap + 14 + bottom.offsetHeight <=
        frame.clientHeight;
      setRows(others.length > columns && twoRows ? 2 : 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [others.length, view.revision]);

  return (
    <Shell
      onQuit={onQuit}
      felt
      yours={view.yourTurn}
      status={view.yourTurn ? "À toi" : `Tour de ${current?.name ?? "…"}`}
    >
      {others.length > 0 ? (
        <div
          ref={listRef}
          className={`skyjo-opponents grid shrink-0 auto-cols-max grid-flow-col gap-2 overflow-x-auto px-1 pt-2 pb-2.5 ${
            rows === 2 ? "grid-rows-2" : "grid-rows-1"
          }`}
        >
          {others.map((player) => (
            <Opponent
              key={player.id}
              player={player}
              active={spotlight && player.current}
              quiet={spotlight && !player.current}
            />
          ))}
        </div>
      ) : null}
      <div ref={bottomRef} className="mt-auto shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-14 min-w-0 flex-1 flex-col justify-center">
            <p
              className={`line-clamp-2 text-sm leading-5 font-bold ${
                error ? "text-rose-200" : "text-white"
              }`}
            >
              {error ?? view.hint}
            </p>
            <p className="h-4 truncate text-[11px] text-white/50">
              {view.lastEvent}
            </p>
          </div>
          <div className="flex shrink-0 items-end gap-1.5 pt-3 pr-1.5">
            <Pile
              title="Pioche"
              detail={String(view.deckCount)}
              lifted={
                drawn ? (
                  <CardFace
                    faceUp={revealedHold !== null}
                    value={revealedHold}
                    label={
                      revealedHold === null
                        ? "Carte piochée, cachée"
                        : `Carte piochée ${revealedHold}`
                    }
                  />
                ) : null
              }
              secret={drawn && revealedHold === null}
              enabled={view.actions.draw && !busy}
              onClick={() => onAction({ type: "draw" })}
              label={
                view.actions.draw
                  ? `Piocher, ${view.deckCount} cartes`
                  : `Pioche, ${view.deckCount} cartes`
              }
            >
              <CardFace
                faceUp={false}
                value={null}
                label={`Pioche, ${view.deckCount} cartes`}
              />
            </Pile>
            <div className="flex w-8 flex-col items-center">
              <div className="flex h-16 items-center">
                <button
                  type="button"
                  aria-label="Défausser la carte piochée"
                  disabled={!view.actions.discardDrawn || busy}
                  onClick={() => onAction({ type: "discard-drawn" })}
                  className={`grid size-8 place-items-center rounded-full bg-amber-300 text-[#1a1405] shadow-md ${
                    view.actions.discardDrawn
                      ? "skyjo-arrow"
                      : "pointer-events-none invisible"
                  }`}
                >
                  <ArrowRight className="size-4" strokeWidth={2.5} />
                </button>
              </div>
              <p
                className="invisible mt-1 h-3 text-[9px] leading-3"
                aria-hidden="true"
              >
                ·
              </p>
            </div>
            <Pile
              title="Défausse"
              lifted={
                taken ? (
                  <CardFace
                    faceUp={revealedHold !== null}
                    value={revealedHold}
                    label={
                      revealedHold === null
                        ? "Carte prise, cachée"
                        : `Carte prise ${revealedHold}`
                    }
                  />
                ) : null
              }
              secret={taken && revealedHold === null}
              enabled={view.actions.takeDiscard && !busy}
              onClick={() => onAction({ type: "take-discard" })}
              label={
                view.actions.takeDiscard
                  ? `Prendre la défausse ${view.discardTop}`
                  : view.discardTop === null
                    ? "Défausse vide"
                    : `Défausse ${view.discardTop}`
              }
            >
              {view.discardTop === null ? (
                <CardFace
                  empty
                  faceUp={false}
                  value={null}
                  label="Défausse vide"
                />
              ) : (
                <CardFace
                  faceUp
                  value={view.discardTop}
                  label={`Défausse ${view.discardTop}`}
                />
              )}
            </Pile>
          </div>
        </div>
        {you ? (
          <section
            className={`mt-2 rounded-[1.6rem] px-2.5 pt-2.5 pb-3 ${
              view.yourTurn
                ? "bg-black/30 shadow-[inset_0_0_0_1.5px_rgba(252,211,77,0.75)]"
                : "bg-black/20"
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold">
                {you.name}
              </h2>
              <p
                className="shrink-0 text-xs font-bold text-white/65 tabular-nums"
                aria-label={`Score visible ${you.visible}`}
              >
                {you.visible}
              </p>
              <p
                className="shrink-0 text-xs font-extrabold tabular-nums"
                aria-label={`Score total ${you.total}`}
              >
                {you.total}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
              {you.grid.map((cell, index) => {
                const canSwap = view.actions.swap && !cell.empty;
                const canFlip =
                  view.actions.flip && !cell.empty && !cell.faceUp;
                const column = (index % 4) + 1;
                const row = Math.floor(index / 4) + 1;
                return (
                  <CardFace
                    key={`${you.id}-${index}`}
                    value={cell.value}
                    faceUp={cell.faceUp}
                    empty={cell.empty}
                    indices
                    framed
                    interactive={canSwap || canFlip}
                    onClick={
                      canSwap || canFlip
                        ? () =>
                            onAction(
                              canSwap
                                ? { type: "swap", index }
                                : { type: "flip", index }
                            )
                        : undefined
                    }
                    label={
                      cell.empty
                        ? `Colonne ${column}, ligne ${row}, vide`
                        : cell.faceUp
                          ? `Colonne ${column}, ligne ${row}, ${cell.value}`
                          : `Colonne ${column}, ligne ${row}, cachée`
                    }
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}

function Opponent({
  player,
  active,
  quiet,
}: {
  player: ViewPlayer;
  active: boolean;
  quiet: boolean;
}) {
  return (
    <article
      className={`w-[7rem] shrink-0 rounded-2xl p-1.5 ring-2 ring-inset ${
        active ? "bg-amber-200/20 ring-amber-300" : "bg-black/25 ring-white/30"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[10px] leading-none">
        <span
          className={`min-w-0 flex-1 truncate text-[11px] font-extrabold ${
            active ? "text-amber-100" : "text-white/75"
          }`}
        >
          {player.name}
        </span>
        <span
          className="shrink-0 font-bold text-white/60 tabular-nums"
          aria-label={`Score visible ${player.visible}`}
        >
          {player.visible}
        </span>
        <span
          className="shrink-0 font-extrabold tabular-nums"
          aria-label={`Score total ${player.total}`}
        >
          {player.total}
        </span>
      </p>
      <div
        className={`mt-1 grid grid-cols-4 gap-0.5 ${quiet ? "opacity-45" : ""}`}
      >
        {player.grid.map((cell, index) => (
          <CardFace
            key={`${player.id}-${index}`}
            size="sm"
            value={cell.value}
            faceUp={cell.faceUp}
            empty={cell.empty}
            label={`${player.name} carte ${index + 1}`}
          />
        ))}
      </div>
    </article>
  );
}

function Pile({
  title,
  detail,
  lifted,
  secret = false,
  enabled,
  onClick,
  label,
  children,
}: {
  title: string;
  detail?: string;
  lifted: ReactNode;
  secret?: boolean;
  enabled: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-12 flex-col items-center">
      <div className="relative w-full">
        <button
          type="button"
          disabled={!enabled}
          onClick={onClick}
          aria-label={label}
          className="relative z-10 block w-full"
        >
          {isValidElement(children)
            ? cloneElement(children as ReactElement<{ highlight?: boolean }>, {
                highlight: enabled,
              })
            : children}
        </button>
        {lifted ? (
          <div
            className={`pointer-events-none absolute inset-0 z-20 ${
              secret
                ? "translate-y-[-70%] -rotate-6"
                : "-translate-x-0.5 -translate-y-2"
            }`}
          >
            {lifted}
          </div>
        ) : null}
      </div>
      <p className="mt-1 h-3 truncate text-[9px] leading-3 font-bold tracking-wide text-white/55 uppercase">
        {title}
        {detail ? ` ${detail}` : ""}
      </p>
    </div>
  );
}

function Summary({
  view,
  onAction,
  onQuit,
  busy,
}: {
  view: GameView;
  onAction: (action: Action) => void;
  onQuit: () => void;
  busy: boolean;
}) {
  const ranking = [...view.players].sort((a, b) => a.total - b.total);
  return (
    <Shell onQuit={onQuit}>
      <h2 className="text-center text-2xl font-extrabold">
        {view.phase === "over" ? "Partie terminée" : `Manche ${view.round}`}
      </h2>
      <p className="mt-1 text-center text-sm text-white/70">{view.hint}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {ranking.map((player, index) => {
          const score = view.summary?.find(
            (entry) => entry.playerId === player.id
          );
          const winner = view.winners.includes(player.id);
          return (
            <li key={player.id} className="rounded-2xl bg-white/10 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-extrabold">
                  {view.phase === "over" ? `${index + 1}. ` : ""}
                  {player.name}
                  {winner ? " · gagne" : ""}
                </p>
                <p className="text-right text-sm">
                  {score?.doubled
                    ? `${score.raw} ×2 = ${score.points}`
                    : `${score?.points ?? 0} pts`}
                  <span className="block text-white/60">
                    Total {player.total}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {view.phase === "between" ? (
        <button
          type="button"
          className={`${primaryButton} mt-auto`}
          disabled={busy}
          onClick={() => onAction({ type: "next-round" })}
        >
          Manche suivante
        </button>
      ) : (
        <button
          type="button"
          className={`${primaryButton} mt-auto`}
          onClick={onQuit}
        >
          Retour à l’accueil
        </button>
      )}
    </Shell>
  );
}

const primaryButton =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 text-lg font-extrabold text-[#1a1405] disabled:opacity-40";
const secondaryButton =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 font-bold disabled:opacity-40";
