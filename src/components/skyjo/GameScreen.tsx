"use client";

import {
  cloneElement,
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import {
  ArrowRight,
  Bot,
  Copy,
  Minus,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Trophy,
} from "lucide-react";

import {
  opponentMotion,
  type OpponentMotion,
} from "@/lib/skyjo/opponent-motion";
import { useSkyjoSettings, type SkyjoSettings } from "@/lib/skyjo/settings";
import type {
  Action,
  GameView,
  RevealCard,
  ViewCell,
  ViewPlayer,
} from "@/lib/skyjo/types";
import {
  botLevelLabel,
  BotLevelPicker,
} from "@/components/skyjo/BotLevelPicker";
import { CardFace } from "@/components/skyjo/CardFace";

type PlayAction = (
  action: Action
) => GameView | null | Promise<GameView | null>;

export const GameScreen = memo(function GameScreen({
  view,
  onAction,
  onQuit,
  onRefresh,
  busy = false,
  error,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  onRefresh: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}) {
  const { settings, ready, update } = useSkyjoSettings();
  const previousRef = useRef<GameView | null>(null);
  const [revealRound, setRevealRound] = useState<string | null>(null);
  const ending = view.phase === "between" || view.phase === "over";
  const roundKey = `${view.code}:${view.round}`;
  const previous = previousRef.current;
  const canReveal =
    ending &&
    revealRound !== roundKey &&
    previous !== null &&
    previous.phase !== "between" &&
    previous.phase !== "over" &&
    previous.round === view.round &&
    (view.uncovered ?? []).length > 0;
  if (!ending) previousRef.current = view;

  if (canReveal && previous) {
    return (
      <RoundReveal
        previous={previous}
        view={view}
        settings={settings}
        onSettings={update}
        onQuit={onQuit}
        onRefresh={onRefresh}
        onDone={() => setRevealRound(roundKey)}
      />
    );
  }
  if (view.phase === "lobby") {
    return (
      <Lobby
        view={view}
        onAction={onAction}
        onQuit={onQuit}
        onRefresh={onRefresh}
        busy={busy}
        error={error}
        settings={settings}
        onSettings={update}
      />
    );
  }
  if (view.phase === "between" || view.phase === "over") {
    return (
      <Summary
        view={view}
        onAction={onAction}
        onQuit={onQuit}
        onRefresh={onRefresh}
        busy={busy}
        settings={settings}
        onSettings={update}
      />
    );
  }
  return (
    <Board
      view={view}
      onAction={onAction}
      onQuit={onQuit}
      onRefresh={onRefresh}
      busy={busy}
      error={error}
      settings={settings}
      settingsReady={ready}
      onSettings={update}
    />
  );
});

function useTurnCallout(active: boolean, duration = 1600) {
  const [visible, setVisible] = useState(false);
  const seen = useRef(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      seen.current = false;
      return;
    }
    if (seen.current) return;
    seen.current = true;
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      hideTimer.current = null;
    }, duration);
  }, [active, duration]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  return visible;
}

function Shell({
  children,
  code,
  onQuit,
  onRefresh,
  felt = false,
  status,
  yours = false,
  callout = null,
  settings,
  onSettings,
}: {
  children: ReactNode;
  code?: string;
  onQuit: () => void;
  onRefresh: () => void | Promise<void>;
  felt?: boolean;
  status?: string;
  yours?: boolean;
  callout?: { title: string; detail?: string; tone: "turn" | "finale" } | null;
  settings: SkyjoSettings;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [options, setOptions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const online = Boolean(code && code !== "LOCAL");
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <main
      className={`relative mx-auto flex h-dvh w-full max-w-lg flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white ${
        felt ? "skyjo-table" : ""
      }`}
    >
      <div className="mb-2 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p className="truncate text-base font-extrabold tracking-tight">
          Skyjo
          {online ? ` - ${code}` : ""}
        </p>
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
        <div className="flex items-center justify-self-end">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-white/75 disabled:opacity-40"
            aria-label="Rafraîchir"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-white/75"
            aria-label="Options"
            onClick={() => setOptions(true)}
          >
            <Settings className="size-4" />
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-sm text-white/75"
            onClick={() => setConfirm(true)}
          >
            Quitter
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      {callout ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none absolute inset-0 z-40 grid place-items-center bg-[#041910]/55 px-6 ${
            callout.tone === "turn" ? "skyjo-callout-short" : "skyjo-callout"
          }`}
        >
          <div
            className={`w-full max-w-xs rounded-3xl px-6 py-5 text-center shadow-2xl ${
              callout.tone === "finale"
                ? "bg-[#3a140c] text-white ring-2 ring-rose-200"
                : "bg-amber-300 text-[#1a1405]"
            }`}
          >
            <p className="text-2xl font-extrabold">{callout.title}</p>
            {callout.detail ? (
              <p
                className={`mt-1 text-sm font-bold ${
                  callout.tone === "finale"
                    ? "text-white/80"
                    : "text-[#1a1405]/75"
                }`}
              >
                {callout.detail}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {options ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/65 px-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="options-title"
            className="w-full max-w-xs rounded-3xl bg-[#0b3a28] p-5 shadow-2xl ring-1 ring-white/15"
          >
            <p id="options-title" className="text-lg font-extrabold">
              Options
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Message « À toi de jouer »</p>
              <button
                type="button"
                role="switch"
                aria-checked={settings.turnCallout}
                aria-label="Message À toi de jouer"
                onClick={() =>
                  onSettings({ turnCallout: !settings.turnCallout })
                }
                className={`relative h-7 w-12 shrink-0 rounded-full ${
                  settings.turnCallout ? "bg-amber-300" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-6 rounded-full bg-[#1a1405] transition ${
                    settings.turnCallout ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <button
              type="button"
              className="mt-5 h-12 w-full rounded-2xl bg-white/10 font-extrabold"
              onClick={() => setOptions(false)}
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}
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
  onRefresh,
  busy,
  error,
  settings,
  onSettings,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  onRefresh: () => void | Promise<void>;
  busy: boolean;
  error?: string | null;
  settings: SkyjoSettings;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const [notice, setNotice] = useState<"code" | "link" | "error" | null>(null);
  const noticeTimer = useRef(0);
  const link =
    typeof window === "undefined"
      ? view.code
      : `${window.location.origin}/partie/${view.code}`;

  function flash(next: "code" | "link" | "error") {
    setNotice(next);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2000);
  }

  function copyWithCommand(text: string) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  async function copyText(text: string) {
    // Pendant le clic : le presse-papiers moderne est souvent bloqué
    // (page en http sur le téléphone, ou permission refusée).
    if (copyWithCommand(text)) return true;
    if (!navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Skyjo",
          text: `Rejoins ma partie Skyjo : ${view.code}`,
          url: link,
        });
        return;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
      }
    }
    flash((await copyText(link)) ? "link" : "error");
  }

  async function copyCode() {
    flash((await copyText(view.code)) ? "code" : "error");
  }

  return (
    <Shell
      code={view.code}
      onQuit={onQuit}
      onRefresh={onRefresh}
      settings={settings}
      onSettings={onSettings}
    >
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
          {notice === "link" ? "Lien copié" : "Partager"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void copyCode()}
        >
          <Copy className="size-4" />
          {notice === "code" ? "Copié" : "Copier"}
        </button>
      </div>
      {notice === "error" ? (
        <p className="mt-2 text-center text-sm text-rose-200">
          Copie impossible
        </p>
      ) : null}
      <ul className="mt-6 flex flex-col gap-2">
        {view.players.map((player) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
          >
            <span className="flex min-w-0 items-center gap-2 font-bold">
              <Presence player={player} />
              {player.isBot ? <Bot className="size-4" /> : null}
              <span className="truncate">{player.name}</span>
              {player.isBot ? (
                <span className="shrink-0 text-xs font-semibold text-white/55">
                  {botLevelLabel(player.botLevel)}
                </span>
              ) : null}
              <PresenceNote player={player} />
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
        <div className="mt-4">
          <BotLevelPicker
            value={settings.botLevel}
            onChange={(botLevel) => onSettings({ botLevel })}
          />
        </div>
      ) : null}
      {view.youAreHost ? (
        <button
          type="button"
          className={`${secondaryButton} mt-3`}
          disabled={!view.actions.addBot || busy}
          onClick={() =>
            onAction({ type: "add-bot", level: settings.botLevel })
          }
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
  onRefresh,
  busy,
  error,
  settings,
  settingsReady,
  onSettings,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  onRefresh: () => void | Promise<void>;
  busy: boolean;
  error?: string | null;
  settings: SkyjoSettings;
  settingsReady: boolean;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const you = useMemo(
    () => view.players.find((player) => player.isYou),
    [view.players]
  );
  const others = useMemo(
    () => view.players.filter((player) => !player.isYou),
    [view.players]
  );
  const presenceKey = others
    .map((player) => `${player.id}:${player.connected}:${player.left}`)
    .join("|");

  const current = view.players.find((player) => player.current);
  const spotlight = view.phase !== "opening";
  const holding = view.hand !== null || view.opponentHolding;
  const revealedHold = view.hand ?? view.opponentHand;
  const taken = holding && !view.holdFromDeck;
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CardDrag | null>(null);
  const pickTask = useRef<Promise<GameView | null> | null>(null);
  const blockClick = useRef(false);
  const stopListeners = useRef<(() => void) | null>(null);
  const flightSeq = useRef(0);
  const sending = useRef(false);
  const viewRef = useRef(view);
  const onActionRef = useRef(onAction);
  const busyRef = useRef(busy);
  viewRef.current = view;
  onActionRef.current = onAction;
  busyRef.current = busy;
  const placeRef = useRef<(index: number, element: HTMLElement) => void>(
    () => {}
  );
  const playAt = useCallback((index: number, element: HTMLElement) => {
    if (viewRef.current.actions.swap) {
      placeRef.current(index, element);
      return;
    }
    if (busyRef.current || sending.current) return;
    sending.current = true;
    setPendingFlip(index);
    const result = onActionRef.current({ type: "flip", index });
    void Promise.resolve(result).finally(() => {
      sending.current = false;
      setPendingFlip((current) => (current === index ? null : current));
    });
  }, []);
  const [rows, setRows] = useState(1);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [covered, setCovered] = useState<CoveredCell | null>(null);
  const [settled, setSettled] = useState<number | null>(null);
  const [hideHold, setHideHold] = useState(false);
  const [drag, setDrag] = useState<CardDrag | null>(null);
  const [locking, setLocking] = useState<null | "deck" | "discard">(null);
  const [pendingDraw, setPendingDraw] = useState(false);
  const [pendingFlip, setPendingFlip] = useState<number | null>(null);
  const [frozenDiscard, setFrozenDiscard] = useState<{
    top: number | null;
  } | null>(null);
  const [oppMask, setOppMask] = useState<{
    playerId: string;
    cells: (ViewCell | undefined)[];
  } | null>(null);
  const seenView = useRef<GameView | null>(null);
  const playedView = useRef<number | null>(null);
  const heldBox = useRef<Box | null>(null);
  const oppToken = useRef(0);
  const oppTimers = useRef<number[]>([]);
  const discardTop = frozenDiscard ? frozenDiscard.top : view.discardTop;
  const awaitingDraw = pendingDraw && view.hand === null;
  const drawn = (holding && view.holdFromDeck) || awaitingDraw;
  const deckCount = awaitingDraw
    ? Math.max(0, view.deckCount - 1)
    : view.deckCount;
  const closer = view.players.find((player) => player.id === view.closerId);
  const finale = useTurnCallout(view.lastRound);
  const turn = useTurnCallout(
    settingsReady &&
      settings.turnCallout &&
      view.yourTurn &&
      view.phase === "choose",
    900
  );
  const closingLine = closer?.isYou
    ? "Tu as tout retourné"
    : `${closer?.name ?? "Un joueur"} a tout retourné`;
  const callout = finale
    ? {
        tone: "finale" as const,
        title: "Dernier tour",
        detail:
          view.yourTurn && settings.turnCallout
            ? `${closingLine}. À toi de jouer.`
            : closingLine,
      }
    : turn
      ? { tone: "turn" as const, title: "À toi de jouer" }
      : null;

  useLayoutEffect(() => {
    const list = listRef.current;
    const bottom = bottomRef.current;
    const frame = list?.parentElement;
    if (!list || !bottom || !frame) return;

    const measure = () => {
      const cards = [...list.querySelectorAll("article")];
      const card = cards.reduce<Element | null>((tallest, item) => {
        if (!tallest) return item;
        return item.getBoundingClientRect().height >
          tallest.getBoundingClientRect().height
          ? item
          : tallest;
      }, null);
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
  }, [others.length, presenceKey]);

  const duel = others.length === 1;
  useLayoutEffect(() => {
    const list = listRef.current;
    const bottom = bottomRef.current;
    const frame = list?.parentElement;
    if (!duel || !list || !bottom || !frame) return;

    const fit = () => {
      const article = list.querySelector("article");
      const mine = bottom.querySelector(":scope > section");
      const piles = bottom.firstElementChild;
      const opponentHead = article?.querySelector(":scope > p");
      const myHead = mine?.querySelector(":scope > div");
      const grid = article?.querySelector(":scope > .grid");
      if (!article || !mine || !piles || !opponentHead || !myHead || !grid) {
        return;
      }
      const extra = (element: Element) => {
        const style = getComputedStyle(element);
        return (
          (Number.parseFloat(style.paddingTop) || 0) +
          (Number.parseFloat(style.paddingBottom) || 0) +
          (Number.parseFloat(style.marginTop) || 0) +
          (Number.parseFloat(style.marginBottom) || 0)
        );
      };
      const gridStyle = getComputedStyle(grid);
      const gapX = Number.parseFloat(gridStyle.columnGap) || 0;
      const gapY = Number.parseFloat(gridStyle.rowGap) || 0;
      const articleStyle = getComputedStyle(article);
      const gridWidth =
        article.clientWidth -
        (Number.parseFloat(articleStyle.paddingLeft) || 0) -
        (Number.parseFloat(articleStyle.paddingRight) || 0);
      const byWidth = (gridWidth - gapX * 3) / 4;
      const fixed =
        opponentHead.getBoundingClientRect().height +
        extra(opponentHead) +
        myHead.getBoundingClientRect().height +
        extra(myHead) +
        piles.getBoundingClientRect().height +
        extra(article) +
        extra(mine) +
        extra(list) +
        gapY * 2 * 2;
      const byHeight = ((frame.clientHeight - fixed) / 6) * 0.75;
      const card = Math.max(40, Math.min(byWidth, byHeight));
      if (Number.isFinite(card)) {
        frame.style.setProperty(
          "--duel-card",
          `${Math.floor(card * 10) / 10}px`
        );
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => {
      observer.disconnect();
      frame.style.removeProperty("--duel-card");
    };
  }, [duel]);

  useLayoutEffect(() => {
    const held = document.querySelector("[data-skyjo-held]");
    if (!(held instanceof HTMLElement)) return;
    const rect = held.getBoundingClientRect();
    if (rect.width > 2) heldBox.current = rect;
  });

  useLayoutEffect(() => {
    const next = viewRef.current;
    if (playedView.current === next.revision) return;
    const prev = seenView.current;
    seenView.current = next;
    playedView.current = next.revision;
    if (!prev || prev.revision === next.revision) return;
    const motion = opponentMotion(prev, next);
    if (
      !motion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    for (const id of oppTimers.current) window.clearTimeout(id);
    oppTimers.current = [];
    const token = oppToken.current + 1;
    oppToken.current = token;
    const live = () => oppToken.current === token;
    const later = (delay: number, run: () => void) => {
      const id = window.setTimeout(() => {
        if (live()) run();
      }, delay);
      oppTimers.current.push(id);
    };
    const fly = (value: number | null, faceUp: boolean, from: Box, to: Box) => {
      const id = flightSeq.current + 1;
      flightSeq.current = id;
      setFlights((list) => [...list, { id, value, faceUp, from, to }]);
      window.setTimeout(() => {
        setFlights((list) => list.filter((item) => item.id !== id));
      }, 480);
    };
    const releaseDiscard = () => {
      if (live()) setFrozenDiscard(null);
    };

    if (motion.kind === "draw") {
      const from = cardRect('[data-skyjo-pile="deck"] button');
      const to = heldBox.current;
      if (!from || !to) return;
      setHideHold(true);
      fly(null, false, from, to);
      later(480, () => setHideHold(false));
      return;
    }

    if (motion.kind === "take" || motion.kind === "discard") {
      const from =
        motion.kind === "take"
          ? cardRect('[data-skyjo-pile="discard"] button')
          : heldBox.current;
      const to =
        motion.kind === "take"
          ? heldBox.current
          : cardRect('[data-skyjo-pile="discard"] button');
      if (motion.kind === "discard") setFrozenDiscard({ top: motion.pile });
      if (motion.kind === "take") setHideHold(true);
      if (from && to) fly(motion.value, true, from, to);
      later(480, () => {
        setHideHold(false);
        releaseDiscard();
      });
      return;
    }

    playOpponentSwap(motion, live, later, fly, releaseDiscard);

    function playOpponentSwap(
      move: Extract<OpponentMotion, { kind: "swap" }>,
      still: () => boolean,
      after: (delay: number, run: () => void) => void,
      launch: (
        value: number | null,
        faceUp: boolean,
        from: Box,
        to: Box
      ) => void,
      unfreeze: () => void
    ) {
      const target = cardRect(oppCellSelector(move.playerId, move.index));
      const deck = cardRect('[data-skyjo-pile="deck"] button');
      const discard = cardRect('[data-skyjo-pile="discard"] button');
      const origin = move.held
        ? (heldBox.current ?? (move.fromDeck ? deck : discard))
        : move.fromDiscard
          ? discard
          : deck;
      if (!target || !origin) return;
      const cells: (ViewCell | undefined)[] = [];
      cells[move.index] = move.before;
      for (const card of move.cleared) {
        if (card.index === move.index) continue;
        cells[card.index] = {
          empty: false,
          faceUp: true,
          value: card.value,
        };
      }
      setOppMask({ playerId: move.playerId, cells });
      setFrozenDiscard({ top: move.pile });
      launch(move.incoming, true, origin, target);
      after(440, () => {
        const depart = () => {
          if (!still()) return;
          const source =
            cardRect(oppCellSelector(move.playerId, move.index)) ?? target;
          const pile = cardRect('[data-skyjo-pile="discard"] button');
          if (pile) launch(move.outgoing, true, source, pile);
          if (move.cleared.length === 0) {
            setOppMask(null);
            after(480, unfreeze);
            return;
          }
          const placed = cells.slice();
          placed[move.index] = {
            empty: false,
            faceUp: true,
            value: move.incoming,
          };
          setOppMask({ playerId: move.playerId, cells: placed });
          after(420, () => {
            if (!still()) return;
            const destination = cardRect('[data-skyjo-pile="discard"] button');
            if (destination) {
              for (const card of move.cleared) {
                const box =
                  cardRect(oppCellSelector(move.playerId, card.index)) ??
                  source;
                launch(card.value, true, box, destination);
              }
            }
            setOppMask(null);
            after(480, unfreeze);
          });
        };
        if (!move.hidden) {
          depart();
          return;
        }
        const revealed = cells.slice();
        revealed[move.index] = {
          empty: false,
          faceUp: true,
          value: move.outgoing,
        };
        setOppMask({ playerId: move.playerId, cells: revealed });
        after(360, depart);
      });
    }
  }, [view.revision]);

  useEffect(() => () => stopListeners.current?.(), []);

  function resolveAction(
    result: GameView | null | Promise<GameView | null>
  ): Promise<GameView | null> {
    return Promise.resolve(result).then((next) => next ?? null);
  }

  function placeCard(index: number, target: HTMLElement) {
    if (busyRef.current || sending.current) return;
    const value = viewRef.current.hand;
    const source = document.querySelector("[data-skyjo-held]");
    sending.current = true;
    const result = onActionRef.current({ type: "swap", index });
    void Promise.resolve(result).finally(() => {
      sending.current = false;
    });
    if (value === null || !(source instanceof HTMLElement)) return;
    replaceCard(
      index,
      value,
      source.getBoundingClientRect(),
      target.getBoundingClientRect(),
      result,
      viewRef.current.discardTop
    );
  }
  placeRef.current = placeCard;

  function launchCard(
    index: number | null,
    value: number,
    from: Box,
    to: Box,
    options?: { freezeDiscard?: boolean; holdCover?: boolean }
  ) {
    const freezeDiscard = options?.freezeDiscard ?? false;
    const holdCover = options?.holdCover ?? false;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce) return (_ok: boolean) => {};
    const id = flightSeq.current + 1;
    flightSeq.current = id;
    const previous =
      index === null
        ? null
        : viewRef.current.players.find((player) => player.isYou)?.grid[index];
    const started = performance.now();
    setFlights((list) => [...list, { id, value, faceUp: true, from, to }]);
    if (previous && !previous.empty && index !== null) {
      setCovered({
        index,
        faceUp: previous.faceUp,
        value: previous.value,
        empty: previous.empty,
      });
    }
    if (freezeDiscard) setFrozenDiscard({ top: viewRef.current.discardTop });
    setHideHold(true);
    if (index !== null) setSettled(index);
    let cancelled = false;
    const flightTimer = window.setTimeout(() => {
      if (cancelled) return;
      setFlights((list) => list.filter((item) => item.id !== id));
      setHideHold(false);
    }, 480);
    return (ok: boolean) => {
      const clearCover = () => {
        if (freezeDiscard) setFrozenDiscard(null);
        if (index === null) return;
        setCovered((current) => (current?.index === index ? null : current));
        setSettled((current) => (current === index ? null : current));
      };
      if (!ok) {
        cancelled = true;
        window.clearTimeout(flightTimer);
        setFlights((list) => list.filter((item) => item.id !== id));
        setHideHold(false);
        clearCover();
        return;
      }
      if (holdCover) return;
      const elapsed = performance.now() - started;
      window.setTimeout(clearCover, Math.max(0, 430 - elapsed));
    };
  }

  function replaceCard(
    index: number,
    incoming: number,
    from: Box,
    to: Box,
    result: GameView | null | Promise<GameView | null>,
    pinnedDiscard: number | null
  ) {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce) return;
    const cell = viewRef.current.players.find((player) => player.isYou)?.grid[
      index
    ];
    const shown = cell && !cell.empty && cell.faceUp ? cell.value : null;
    const started = performance.now();
    setFrozenDiscard({ top: pinnedDiscard });
    const finishIn = launchCard(index, incoming, from, to, { holdCover: true });
    const showPlaced = () => {
      setCovered((current) => (current?.index === index ? null : current));
      setSettled(index);
      window.setTimeout(() => {
        setSettled((current) => (current === index ? null : current));
      }, 80);
    };
    const depart = (value: number) => {
      const source = cellBox(index) ?? to;
      const pile = discardRef.current?.querySelector(
        "[role='button'], [role='img']"
      );
      const landed = performance.now() - started >= 460;
      if (landed) {
        showPlaced();
      } else {
        setCovered({ index, faceUp: false, value: null, empty: true });
        setSettled(index);
        window.setTimeout(
          showPlaced,
          Math.max(0, started + 480 - performance.now())
        );
      }
      if (pile instanceof HTMLElement) {
        const finishOut = launchCard(
          null,
          value,
          source,
          pile.getBoundingClientRect()
        );
        finishOut(true);
      }
      window.setTimeout(() => setFrozenDiscard(null), 430);
    };
    void Promise.resolve(result).then(
      (next) => {
        const exchange =
          next?.exchange && next.exchange.index === index
            ? next.exchange
            : null;
        const outgoing =
          shown ??
          exchange?.value ??
          (next &&
          next.players.find((player) => player.isYou)?.grid[index]?.empty ===
            false
            ? next.discardTop
            : null);
        if (!next || outgoing == null) {
          finishIn(false);
          setFrozenDiscard(null);
          return;
        }
        const hidden = shown == null && (exchange?.hidden ?? true);
        if (!hidden) {
          depart(outgoing);
          return;
        }
        setSettled(null);
        setCovered({
          index,
          faceUp: true,
          value: outgoing,
          empty: false,
        });
        window.setTimeout(() => depart(outgoing), 360);
      },
      () => {
        finishIn(false);
        setFrozenDiscard(null);
      }
    );
  }

  function discardFlight(value: number, from: Box) {
    const target = discardRef.current?.querySelector(
      "[role='button'], [role='img']"
    );
    if (!(target instanceof HTMLElement)) return null;
    return launchCard(null, value, from, target.getBoundingClientRect(), {
      freezeDiscard: true,
    });
  }

  function occupied(index: number) {
    const cell = viewRef.current.players.find((player) => player.isYou)?.grid[
      index
    ];
    return Boolean(cell && !cell.empty);
  }

  function cellAt(x: number, y: number) {
    const direct = document
      .elementFromPoint(x, y)
      ?.closest("[data-skyjo-cell]");
    const directIndex = direct
      ? Number(direct.getAttribute("data-skyjo-cell"))
      : null;
    if (directIndex !== null && occupied(directIndex)) return directIndex;
    let best: { index: number; distance: number } | null = null;
    for (const node of document.querySelectorAll<HTMLElement>(
      "[data-skyjo-cell]"
    )) {
      const index = Number(node.getAttribute("data-skyjo-cell"));
      if (!occupied(index)) continue;
      const card = node.querySelector("[role='button'], [role='img']");
      if (!(card instanceof HTMLElement)) continue;
      const box = card.getBoundingClientRect();
      const pad = 10;
      if (
        x < box.left - pad ||
        x > box.right + pad ||
        y < box.top - pad ||
        y > box.bottom + pad
      ) {
        continue;
      }
      const distance = Math.hypot(
        x - (box.left + box.width / 2),
        y - (box.top + box.height / 2)
      );
      if (!best || distance < best.distance) best = { index, distance };
    }
    return best?.index ?? null;
  }

  function hitDiscard(x: number, y: number) {
    const zones = [
      discardRef.current,
      document.querySelector("[data-skyjo-discard-drop]"),
    ];
    return zones.some((node) => {
      if (!node) return false;
      const box = node.getBoundingClientRect();
      const pad = 12;
      return (
        x >= box.left - pad &&
        x <= box.right + pad &&
        y >= box.top - pad &&
        y <= box.bottom + pad
      );
    });
  }

  function cellBox(index: number) {
    const slot = document.querySelector(`[data-skyjo-cell="${index}"]`);
    const card = slot?.querySelector("[role='button'], [role='img']");
    return card instanceof HTMLElement ? card.getBoundingClientRect() : null;
  }

  function rememberDrag(next: CardDrag) {
    dragRef.current = next;
    setDrag(next);
  }

  function clearDrag() {
    dragRef.current = null;
    pickTask.current = null;
    setDrag(null);
  }

  function pickDeck() {
    if (pickTask.current) return pickTask.current;
    const task = resolveAction(onActionRef.current({ type: "draw" })).then(
      (next) => {
        const origin = dragRef.current;
        if (origin?.source === "deck" && next?.hand != null) {
          rememberDrag({ ...origin, value: next.hand, faceUp: true });
        }
        return next;
      }
    );
    pickTask.current = task;
    return task;
  }

  function startDrag(
    source: DragSource,
    event: ReactPointerEvent<HTMLElement>
  ) {
    if (
      event.button !== 0 ||
      busyRef.current ||
      sending.current ||
      dragRef.current
    )
      return;
    const current = viewRef.current;
    if (source === "deck" && (!current.actions.draw || current.hand !== null)) {
      return;
    }
    if (source === "discard" && !current.actions.takeDiscard) return;
    if (
      source === "drawn" &&
      (current.hand === null ||
        !current.holdFromDeck ||
        (!current.actions.swap && !current.actions.discardDrawn))
    ) {
      return;
    }
    if (
      source === "taken" &&
      (current.hand === null || current.holdFromDeck || !current.actions.swap)
    ) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const value =
      source === "discard"
        ? current.discardTop
        : source === "deck"
          ? null
          : current.hand;
    rememberDrag({
      pointerId: event.pointerId,
      source,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      overCell: null,
      overDiscard: false,
      value,
      faceUp: value !== null,
    });
    const move = (pointer: PointerEvent) => {
      const origin = dragRef.current;
      if (!origin || origin.pointerId !== pointer.pointerId) return;
      const moved =
        origin.moved ||
        Math.hypot(
          pointer.clientX - origin.startX,
          pointer.clientY - origin.startY
        ) > 8;
      if (moved && pointer.cancelable) pointer.preventDefault();
      if (moved && !origin.moved) blockClick.current = true;
      const overCell = moved ? cellAt(pointer.clientX, pointer.clientY) : null;
      const canDiscard = origin.source === "deck" || origin.source === "drawn";
      const latest = dragRef.current ?? origin;
      rememberDrag({
        ...origin,
        value: latest.value,
        faceUp: latest.faceUp,
        x: pointer.clientX - origin.dx,
        y: pointer.clientY - origin.dy,
        moved,
        overCell,
        overDiscard:
          moved &&
          overCell === null &&
          canDiscard &&
          hitDiscard(pointer.clientX, pointer.clientY),
      });
      if (moved && origin.source === "deck") void pickDeck();
    };
    const end = (pointer: PointerEvent) => {
      if (dragRef.current?.pointerId !== pointer.pointerId) return;
      stop();
      window.setTimeout(() => {
        blockClick.current = false;
      }, 0);
      void dropDrag(pointer, pointer.type === "pointercancel");
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (stopListeners.current === stop) stopListeners.current = null;
    };
    stopListeners.current = stop;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  async function dropDrag(pointer: PointerEvent, cancelled: boolean) {
    const origin = dragRef.current;
    if (!origin) return;
    const moved =
      origin.moved ||
      Math.hypot(
        pointer.clientX - origin.startX,
        pointer.clientY - origin.startY
      ) > 8;
    if (!moved || cancelled || sending.current) {
      clearDrag();
      return;
    }
    sending.current = true;
    try {
      await finishDrop(pointer, origin);
    } finally {
      sending.current = false;
    }
  }

  async function finishDrop(pointer: PointerEvent, origin: CardDrag) {
    const overCell = cellAt(pointer.clientX, pointer.clientY);
    const canDiscard = origin.source === "deck" || origin.source === "drawn";
    const overDiscard =
      overCell === null &&
      canDiscard &&
      hitDiscard(pointer.clientX, pointer.clientY);
    const from = {
      left: pointer.clientX - origin.dx,
      top: pointer.clientY - origin.dy,
      width: origin.width,
      height: origin.height,
    };
    if (overDiscard) {
      const drawn =
        origin.source === "deck" ? await pickDeck() : viewRef.current;
      if (drawn?.hand == null || !drawn.actions.discardDrawn) {
        clearDrag();
        return;
      }
      const finish = discardFlight(drawn.hand, from);
      clearDrag();
      const next = await resolveAction(
        onActionRef.current({ type: "discard-drawn" })
      );
      finish?.(next != null);
      if (!finish && next == null) setHideHold(false);
      return;
    }
    if (overCell === null) {
      clearDrag();
      return;
    }
    const target = cellBox(overCell);
    if (!target) {
      clearDrag();
      return;
    }
    if (origin.source === "discard") {
      if (origin.value === null) {
        clearDrag();
        return;
      }
      setLocking("discard");
      clearDrag();
      const swapped = resolveAction(
        onActionRef.current({ type: "take-discard" })
      ).then((taken) => {
        if (taken?.hand == null) return null;
        return resolveAction(
          onActionRef.current({ type: "swap", index: overCell })
        );
      });
      replaceCard(overCell, origin.value, from, target, swapped, null);
      try {
        await swapped;
      } finally {
        setLocking(null);
      }
      return;
    }
    if (origin.source === "deck") {
      const drawn = await pickDeck();
      if (drawn?.hand == null) {
        clearDrag();
        return;
      }
      clearDrag();
      const swapped = resolveAction(
        onActionRef.current({ type: "swap", index: overCell })
      );
      replaceCard(
        overCell,
        drawn.hand,
        from,
        target,
        swapped,
        viewRef.current.discardTop
      );
      await swapped;
      return;
    }
    if (origin.value === null) {
      clearDrag();
      return;
    }
    clearDrag();
    const swapped = resolveAction(
      onActionRef.current({ type: "swap", index: overCell })
    );
    replaceCard(
      overCell,
      origin.value,
      from,
      target,
      swapped,
      viewRef.current.discardTop
    );
    await swapped;
  }

  function guarded(
    action: () => GameView | null | Promise<GameView | null> | void
  ) {
    if (blockClick.current) {
      blockClick.current = false;
      return;
    }
    if (busyRef.current || sending.current) return;
    sending.current = true;
    try {
      const result = action();
      void Promise.resolve(result ?? null).finally(() => {
        sending.current = false;
      });
    } catch (error) {
      sending.current = false;
      throw error;
    }
  }

  return (
    <Shell
      code={view.code}
      onQuit={onQuit}
      onRefresh={onRefresh}
      felt
      yours={view.yourTurn}
      status={view.yourTurn ? "À toi" : `Tour de ${current?.name ?? "…"}`}
      callout={callout}
      settings={settings}
      onSettings={onSettings}
    >
      {others.length > 0 ? (
        <div
          ref={listRef}
          className={`skyjo-opponents grid shrink-0 pt-4 pb-2.5 ${
            others.length === 1
              ? "grid-cols-1"
              : `auto-cols-max grid-flow-col gap-2 overflow-x-auto px-1 ${
                  rows === 2 ? "grid-rows-2" : "grid-rows-1"
                }`
          }`}
        >
          {others.map((player) => (
            <Opponent
              key={player.id}
              player={player}
              playerCount={others.length + 1}
              active={spotlight && player.current}
              quiet={spotlight && !player.current}
              mask={oppMask?.playerId === player.id ? oppMask.cells : null}
            />
          ))}
        </div>
      ) : null}
      <div ref={bottomRef} className="mt-auto shrink-0">
        <div className="flex items-stretch gap-2">
          <section className="flex min-w-0 flex-1 flex-col justify-center rounded-2xl bg-black/40 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
            <p className="text-[10px] font-extrabold tracking-[0.14em] text-amber-100/75 uppercase">
              Consigne
            </p>
            <p
              className={`mt-1 line-clamp-2 min-h-10 text-sm leading-5 font-bold ${
                error ? "text-rose-200" : "text-white"
              }`}
            >
              {error ?? view.hint}
            </p>
            <p className="mt-1 h-4 truncate text-[11px] text-white/50">
              {view.lastEvent}
            </p>
          </section>
          <section className="flex shrink-0 items-end gap-1.5 rounded-2xl bg-[#02150f]/80 px-2 pt-3 pb-1.5 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.5)]">
            <Pile
              mark="deck"
              title="Pioche"
              detail={String(deckCount)}
              lifted={
                drawn ? (
                  <CardFace
                    faceUp={!awaitingDraw && revealedHold !== null}
                    value={awaitingDraw ? null : revealedHold}
                    label={
                      revealedHold === null
                        ? "Carte piochée, cachée"
                        : `Carte piochée ${revealedHold}`
                    }
                  />
                ) : null
              }
              secret={drawn && revealedHold === null && !awaitingDraw}
              hideLift={hideHold}
              sourceHidden={
                (drag?.moved === true && drag.source === "deck") ||
                locking === "deck"
              }
              heldHidden={
                drag?.moved === true &&
                (drag.source === "drawn" || drag.source === "deck")
              }
              heldLabel="Glisser la carte piochée sur ton jeu ou vers la défausse"
              heldDrag={
                view.hand !== null &&
                view.holdFromDeck &&
                (view.actions.swap || view.actions.discardDrawn)
                  ? {
                      onPointerDown: (event) => startDrag("drawn", event),
                    }
                  : undefined
              }
              onPointerDown={
                view.actions.draw && view.hand === null
                  ? (event) => startDrag("deck", event)
                  : undefined
              }
              enabled={view.actions.draw}
              onClick={() =>
                guarded(() => {
                  if (
                    viewRef.current.actions.draw &&
                    viewRef.current.hand === null
                  ) {
                    setPendingDraw(true);
                  }
                  const result = onAction({ type: "draw" });
                  void Promise.resolve(result).finally(() =>
                    setPendingDraw(false)
                  );
                  return result;
                })
              }
              label={
                view.actions.draw
                  ? `Piocher, ${deckCount} cartes`
                  : `Pioche, ${deckCount} cartes`
              }
            >
              <CardFace
                faceUp={false}
                value={null}
                label={`Pioche, ${deckCount} cartes`}
              />
            </Pile>
            <div className="flex w-8 flex-col items-center">
              <div className="flex h-16 items-center">
                <button
                  type="button"
                  data-skyjo-discard-drop
                  aria-label="Défausser la carte piochée"
                  disabled={!view.actions.discardDrawn}
                  onClick={() =>
                    guarded(() => {
                      const value = viewRef.current.hand;
                      const source =
                        document.querySelector("[data-skyjo-held]");
                      const finish =
                        value !== null && source instanceof HTMLElement
                          ? discardFlight(value, source.getBoundingClientRect())
                          : null;
                      const result = onAction({ type: "discard-drawn" });
                      if (finish) {
                        void Promise.resolve(result).then(
                          (next) => finish(next != null),
                          () => finish(false)
                        );
                      }
                      return result;
                    })
                  }
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
              mark="discard"
              pileRef={discardRef}
              hot={drag?.moved === true && drag.overDiscard}
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
              hideLift={hideHold}
              sourceHidden={
                (drag?.moved === true && drag.source === "discard") ||
                locking === "discard"
              }
              heldHidden={drag?.moved === true && drag.source === "taken"}
              heldLabel="Glisser la carte prise sur ton jeu"
              heldDrag={
                view.hand !== null && !view.holdFromDeck && view.actions.swap
                  ? {
                      onPointerDown: (event) => startDrag("taken", event),
                    }
                  : undefined
              }
              onPointerDown={
                view.actions.takeDiscard
                  ? (event) => startDrag("discard", event)
                  : undefined
              }
              enabled={view.actions.takeDiscard}
              onClick={() => guarded(() => onAction({ type: "take-discard" }))}
              label={
                view.actions.takeDiscard
                  ? `Prendre la défausse ${discardTop}`
                  : discardTop === null
                    ? "Défausse vide"
                    : `Défausse ${discardTop}`
              }
            >
              {discardTop === null ? (
                <CardFace
                  empty
                  settle
                  faceUp={false}
                  value={null}
                  label="Défausse vide"
                />
              ) : (
                <CardFace
                  settle
                  faceUp
                  value={discardTop}
                  label={`Défausse ${discardTop}`}
                />
              )}
            </Pile>
          </section>
        </div>
        {you ? (
          <section
            className={`mt-3 rounded-[1.6rem] px-2.5 pt-2.5 pb-3 ${
              view.yourTurn
                ? "bg-black/30 shadow-[inset_0_0_0_1.5px_rgba(252,211,77,0.75)]"
                : "bg-black/20"
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-extrabold">
                <Presence player={you} />
                <span className="truncate">{you.name}</span>
                <PresenceNote player={you} rejoin />
              </h2>
              <div className="flex shrink-0 items-center rounded-full bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
                <p className="px-2.5 py-1 text-base leading-none font-bold tabular-nums">
                  <RoundScore
                    value={you.visible}
                    label={`Score visible ${you.visible}`}
                    idleClass="text-white/65"
                    popClass="text-xs"
                  />
                </p>
                <span className="h-5 w-px bg-white/30" aria-hidden="true" />
                <p
                  className="px-2.5 py-1 text-lg leading-none font-extrabold tabular-nums"
                  aria-label={`Score total ${you.total}`}
                >
                  {you.total}
                </p>
              </div>
            </div>
            <div
              className={`grid gap-x-3 gap-y-2.5 ${
                duel ? "justify-center" : "grid-cols-4"
              }`}
              style={
                duel
                  ? {
                      gridTemplateColumns:
                        "repeat(4, var(--duel-card, minmax(0, 1fr)))",
                    }
                  : undefined
              }
            >
              {you.grid.map((cell, index) => {
                const shown = covered?.index === index ? covered : cell;
                const canSwap =
                  view.actions.swap && !cell.empty && covered === null;
                const canFlip =
                  view.actions.flip && !cell.empty && !cell.faceUp;
                return (
                  <PlayCard
                    key={`${you.id}-${index}`}
                    cell={shown}
                    index={index}
                    interactive={canSwap || canFlip}
                    highlight={drag?.moved === true && drag.overCell === index}
                    settle={settled === index}
                    turning={pendingFlip === index && !shown.faceUp}
                    onPlay={playAt}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
        {drag?.moved ? (
          <div
            aria-hidden
            className="pointer-events-none fixed z-30"
            style={{
              left: drag.x,
              top: drag.y,
              width: drag.width,
              height: drag.height,
            }}
          >
            <CardFace
              faceUp={drag.faceUp}
              value={drag.value}
              label="Carte en cours de déplacement"
            />
          </div>
        ) : null}
        {flights.map((flight) => (
          <FlyingCard key={flight.id} flight={flight} />
        ))}
      </div>
    </Shell>
  );
}

type CoveredCell = {
  index: number;
  faceUp: boolean;
  value: number | null;
  empty: boolean;
};

type DragSource = "deck" | "discard" | "drawn" | "taken";

type Box = { left: number; top: number; width: number; height: number };

type CardDrag = {
  pointerId: number;
  source: DragSource;
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  moved: boolean;
  overCell: number | null;
  overDiscard: boolean;
  value: number | null;
  faceUp: boolean;
};

type Flight = {
  id: number;
  value: number | null;
  faceUp: boolean;
  from: Box;
  to: Box;
};

function oppCellSelector(playerId: string, index: number) {
  return `[data-skyjo-opp-cell="${CSS.escape(playerId)}:${index}"]`;
}

function cardRect(selector: string): Box | null {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement)) return null;
  const card = node.matches("[role='img'], [role='button']")
    ? node
    : node.querySelector("[role='img'], [role='button']");
  if (!(card instanceof HTMLElement)) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
}

function FlyingCard({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.left = `${flight.from.left}px`;
    node.style.top = `${flight.from.top}px`;
    node.style.width = `${flight.from.width}px`;
    node.style.height = `${flight.from.height}px`;
    const frame = requestAnimationFrame(() => {
      node.style.left = `${flight.to.left}px`;
      node.style.top = `${flight.to.top}px`;
      node.style.width = `${flight.to.width}px`;
      node.style.height = `${flight.to.height}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [flight]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="skyjo-flight pointer-events-none fixed z-30"
    >
      <CardFace
        faceUp={flight.faceUp}
        value={flight.faceUp ? flight.value : null}
        settle
        label="Carte en mouvement"
      />
    </div>
  );
}

function Presence({ player }: { player: ViewPlayer }) {
  if (player.isBot) return null;
  const online = player.connected && !player.left;
  const label = player.left
    ? "A quitté la partie"
    : online
      ? "En ligne"
      : "Hors ligne";
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ring-1 ring-black/40 ${
        online ? "bg-emerald-400" : "bg-rose-500"
      }`}
      title={label}
      aria-label={label}
    />
  );
}

function PresenceNote({
  player,
  rejoin = false,
}: {
  player: ViewPlayer;
  rejoin?: boolean;
}) {
  if (player.isBot || (player.connected && !player.left)) return null;
  return (
    <span className="shrink-0 text-xs font-semibold text-rose-200">
      {player.left ? (rejoin ? "Retour 2 min" : "A quitté") : "Hors ligne"}
    </span>
  );
}

const PlayCard = memo(function PlayCard({
  cell,
  index,
  interactive,
  highlight,
  settle,
  turning,
  onPlay,
}: {
  cell: ViewCell;
  index: number;
  interactive: boolean;
  highlight: boolean;
  settle: boolean;
  turning: boolean;
  onPlay: (index: number, element: HTMLElement) => void;
}) {
  const column = (index % 4) + 1;
  const row = Math.floor(index / 4) + 1;
  return (
    <div data-skyjo-cell={index} className="contents">
      <CardFace
        value={cell.value}
        faceUp={cell.faceUp}
        empty={cell.empty}
        indices
        framed
        settle={settle}
        anticipate={turning}
        highlight={highlight}
        interactive={interactive}
        onClick={interactive ? (element) => onPlay(index, element) : undefined}
        label={
          cell.empty
            ? `Colonne ${column}, ligne ${row}, vide`
            : cell.faceUp
              ? `Colonne ${column}, ligne ${row}, ${cell.value}`
              : `Colonne ${column}, ligne ${row}, cachée`
        }
      />
    </div>
  );
}, samePlayCard);

function samePlayCard(
  prev: {
    cell: ViewCell;
    index: number;
    interactive: boolean;
    highlight: boolean;
    settle: boolean;
    turning: boolean;
  },
  next: {
    cell: ViewCell;
    index: number;
    interactive: boolean;
    highlight: boolean;
    settle: boolean;
    turning: boolean;
  }
) {
  return (
    prev.index === next.index &&
    prev.interactive === next.interactive &&
    prev.highlight === next.highlight &&
    prev.settle === next.settle &&
    prev.turning === next.turning &&
    sameCell(prev.cell, next.cell)
  );
}

function sameCell(prev: ViewCell, next: ViewCell) {
  return (
    prev.empty === next.empty &&
    prev.faceUp === next.faceUp &&
    prev.value === next.value
  );
}

function RoundScore({
  value,
  label,
  idleClass,
  popClass,
  className = "",
}: {
  value: number;
  label: string;
  idleClass: string;
  popClass: string;
  className?: string;
}) {
  const shownRef = useRef(value);
  const [shown, setShown] = useState(value);
  const [tone, setTone] = useState<"up" | "down" | null>(null);
  const [burst, setBurst] = useState<{ id: number; delta: number } | null>(
    null
  );
  const burstId = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const delta = value - from;
    const id = burstId.current + 1;
    burstId.current = id;
    setBurst({ id, delta });
    setTone(delta > 0 ? "up" : "down");
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let frame = 0;
    if (reduce) {
      shownRef.current = value;
      setShown(value);
    } else {
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / 480);
        const eased = 1 - (1 - progress) ** 3;
        const next = progress < 1 ? Math.round(from + delta * eased) : value;
        shownRef.current = next;
        setShown(next);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    const toneTimer = window.setTimeout(() => setTone(null), 560);
    const burstTimer = window.setTimeout(() => {
      setBurst((current) => (current?.id === id ? null : current));
    }, 900);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(toneTimer);
      window.clearTimeout(burstTimer);
    };
  }, [value]);

  return (
    <span className={`relative inline-block ${className}`}>
      <span
        className={
          tone === "up"
            ? "text-rose-300"
            : tone === "down"
              ? "text-emerald-300"
              : idleClass
        }
        aria-label={label}
      >
        {shown}
      </span>
      {burst ? (
        <span
          key={burst.id}
          className={`skyjo-score-pop pointer-events-none absolute bottom-full left-1/2 z-10 font-extrabold whitespace-nowrap tabular-nums ${popClass} ${
            burst.delta > 0 ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {burst.delta > 0 ? `+${burst.delta}` : String(burst.delta)}
        </span>
      ) : null}
    </span>
  );
}

const Opponent = memo(function Opponent({
  player,
  playerCount,
  active,
  quiet,
  mask,
}: {
  player: ViewPlayer;
  playerCount: number;
  active: boolean;
  quiet: boolean;
  mask?: (ViewCell | undefined)[] | null;
}) {
  const duel = playerCount === 2;
  return (
    <article
      className={`shrink-0 ring-2 ring-inset ${
        duel
          ? "w-full rounded-[1.6rem] px-2.5 pt-2.5 pb-3"
          : "w-[7rem] rounded-2xl p-1.5"
      } ${
        active ? "bg-amber-200/20 ring-amber-300" : "bg-black/25 ring-white/30"
      }`}
    >
      <p
        className={`flex items-center leading-none ${
          duel ? "mb-2 gap-2 px-1 text-sm" : "gap-1 text-[10px]"
        }`}
      >
        <Presence player={player} />
        <span
          className={`min-w-0 flex-1 truncate font-extrabold ${
            duel ? "text-sm" : "text-[11px]"
          } ${
            player.left
              ? "text-rose-200"
              : active
                ? "text-amber-100"
                : "text-white/75"
          }`}
        >
          {player.name}
        </span>
        <RoundScore
          value={player.visible}
          label={`Score visible ${player.visible}`}
          idleClass="text-white/60"
          popClass={duel ? "text-xs" : "text-[10px]"}
          className="shrink-0 font-bold"
        />
        <span
          className="shrink-0 font-extrabold tabular-nums"
          aria-label={`Score total ${player.total}`}
        >
          {player.total}
        </span>
      </p>
      {player.left || (!player.isBot && !player.connected) ? (
        <p className="mt-0.5 truncate text-[9px] leading-3 font-bold text-rose-200">
          {player.left ? "Retour 2 min" : "Hors ligne"}
        </p>
      ) : null}
      <div
        className={`grid grid-cols-4 ${
          duel ? "justify-center gap-x-3 gap-y-2.5" : "mt-1 gap-0.5"
        } ${quiet ? "opacity-45" : ""}`}
        style={
          duel
            ? {
                gridTemplateColumns:
                  "repeat(4, var(--duel-card, minmax(0, 1fr)))",
              }
            : undefined
        }
      >
        {player.grid.map((cell, index) => {
          const shown = mask?.[index] ?? cell;
          return (
            <div
              key={`${player.id}-${index}`}
              data-skyjo-opp-cell={`${player.id}:${index}`}
              className="contents"
            >
              <CardFace
                size={duel ? "md" : "sm"}
                value={shown.value}
                faceUp={shown.faceUp}
                empty={shown.empty}
                label={`${player.name} carte ${index + 1}`}
              />
            </div>
          );
        })}
      </div>
    </article>
  );
}, sameOpponent);

function sameOpponent(
  prev: {
    player: ViewPlayer;
    playerCount: number;
    active: boolean;
    quiet: boolean;
    mask?: (ViewCell | undefined)[] | null;
  },
  next: {
    player: ViewPlayer;
    playerCount: number;
    active: boolean;
    quiet: boolean;
    mask?: (ViewCell | undefined)[] | null;
  }
) {
  return (
    prev.playerCount === next.playerCount &&
    prev.active === next.active &&
    prev.quiet === next.quiet &&
    sameMask(prev.mask, next.mask) &&
    prev.player.id === next.player.id &&
    prev.player.name === next.player.name &&
    prev.player.connected === next.player.connected &&
    prev.player.left === next.player.left &&
    prev.player.total === next.player.total &&
    prev.player.visible === next.player.visible &&
    prev.player.current === next.player.current &&
    sameGrid(prev.player.grid, next.player.grid)
  );
}

function sameMask(
  prev?: (ViewCell | undefined)[] | null,
  next?: (ViewCell | undefined)[] | null
) {
  if (!prev && !next) return true;
  if (!prev || !next || prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index];
    const right = next[index];
    if (left === right) continue;
    if (!left || !right || !sameCell(left, right)) return false;
  }
  return true;
}

function sameGrid(prev: ViewCell[], next: ViewCell[]) {
  if (prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index];
    const right = next[index];
    if (!left || !right || !sameCell(left, right)) return false;
  }
  return true;
}

function Pile({
  pileRef,
  mark,
  title,
  detail,
  lifted,
  secret = false,
  hideLift = false,
  sourceHidden = false,
  heldHidden = false,
  heldLabel,
  heldDrag,
  hot = false,
  enabled,
  onPointerDown,
  onClick,
  label,
  children,
}: {
  pileRef?: Ref<HTMLDivElement>;
  mark?: "deck" | "discard";
  title: string;
  detail?: string;
  lifted: ReactNode;
  secret?: boolean;
  hideLift?: boolean;
  sourceHidden?: boolean;
  heldHidden?: boolean;
  heldLabel?: string;
  heldDrag?: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
  hot?: boolean;
  enabled: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={pileRef}
      data-skyjo-pile={mark}
      className="flex w-12 flex-col items-center"
    >
      <div className="relative w-full">
        <button
          type="button"
          disabled={!enabled}
          onPointerDown={onPointerDown}
          onClick={onClick}
          aria-label={label}
          className={`relative z-10 block w-full touch-none ${
            sourceHidden ? "opacity-0" : ""
          }`}
        >
          {isValidElement(children)
            ? cloneElement(children as ReactElement<{ highlight?: boolean }>, {
                highlight: enabled || hot,
              })
            : children}
        </button>
        {lifted && !hideLift ? (
          <div
            data-skyjo-held
            role={heldDrag ? "button" : undefined}
            aria-label={heldDrag ? heldLabel : undefined}
            onPointerDown={heldDrag?.onPointerDown}
            className={`absolute inset-0 z-20 touch-none ${
              heldDrag
                ? "cursor-grab active:cursor-grabbing"
                : "pointer-events-none"
            } ${heldHidden ? "opacity-0" : ""} ${
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
  onRefresh,
  busy,
  settings,
  onSettings,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  onRefresh: () => void | Promise<void>;
  busy: boolean;
  settings: SkyjoSettings;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const finished = view.phase === "over";
  const [boards, setBoards] = useState(false);
  const placed = ranked(view.players);
  const spotlight = finished ? gameWinners(view) : roundWinners(view);
  const spotlightScore = finished
    ? (spotlight[0]?.total ?? 0)
    : roundPoints(view, spotlight[0]?.id);
  const you = placed.find((entry) => entry.player.isYou);
  return (
    <Shell
      code={view.code}
      onQuit={onQuit}
      onRefresh={onRefresh}
      settings={settings}
      onSettings={onSettings}
    >
      <p className="text-center text-sm font-bold text-white/60">
        {finished ? "Partie terminée" : `Manche ${view.round}`}
      </p>
      <div className="mt-3 rounded-3xl border border-amber-200/30 bg-gradient-to-b from-amber-300/25 to-white/5 px-5 py-5 text-center">
        <Trophy className="mx-auto size-8 text-amber-300" aria-hidden />
        <p className="mt-2 text-xs font-bold tracking-[0.22em] text-amber-100/80">
          {finished
            ? spotlight.length > 1
              ? "VAINQUEURS"
              : "VAINQUEUR"
            : "MEILLEURE MANCHE"}
        </p>
        <p className="mt-1 text-3xl leading-tight font-extrabold tracking-tight text-balance">
          {joinNames(spotlight.map((player) => player.name))}
        </p>
        <p className="mt-1 text-lg font-bold text-amber-100">
          {spotlightScore} pts
        </p>
        {spotlight.some((player) => player.isYou) ? (
          <p className="mt-1 text-sm font-bold text-amber-200">
            {spotlight.length > 1
              ? "Tu partages la première place"
              : "C’est toi"}
          </p>
        ) : null}
      </div>
      {you && !boards ? (
        <p className="mt-3 text-center text-sm font-extrabold text-amber-100">
          {standingLine(you, placed)}
        </p>
      ) : null}
      <p className="mt-5 text-center text-xs font-bold tracking-[0.22em] text-white/45">
        {boards ? "JEUX DE LA MANCHE" : "CLASSEMENT"}
      </p>
      {boards ? (
        <div className="mt-3 flex flex-col gap-4">
          {placed.map(({ player }) => {
            const score = view.summary?.find(
              (entry) => entry.playerId === player.id
            );
            return (
              <section
                key={player.id}
                className={`rounded-2xl p-2.5 ${
                  player.isYou
                    ? "border-2 border-amber-300 bg-amber-300/15"
                    : "border-2 border-transparent bg-white/10"
                }`}
              >
                <p className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                  <span className="truncate">{player.name}</span>
                  {player.isYou ? (
                    <span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[#1a1405]">
                      TOI
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 tabular-nums">
                    {score ? `Manche ${score.points}` : `${player.total} pts`}
                  </span>
                </p>
                <EndGrid player={player} />
              </section>
            );
          })}
        </div>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {placed.map(({ player, place }) => {
            const score = view.summary?.find(
              (entry) => entry.playerId === player.id
            );
            const color =
              AVATAR[
                view.players.findIndex((entry) => entry.id === player.id)
              ] ?? AVATAR[0];
            return (
              <li
                key={player.id}
                className={`flex items-center gap-3 rounded-2xl p-2.5 ${
                  player.isYou
                    ? "border-2 border-amber-300 bg-amber-300/15"
                    : "border-2 border-transparent bg-white/10"
                }`}
              >
                <RankBadge place={place} />
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${color}`}
                  aria-hidden
                >
                  {initial(player.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 font-extrabold">
                    <Presence player={player} />
                    <span className="truncate">{player.name}</span>
                    {player.isYou ? (
                      <span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[#1a1405]">
                        TOI
                      </span>
                    ) : null}
                    <PresenceNote
                      player={player}
                      rejoin={view.phase === "between"}
                    />
                  </p>
                  {score?.doubled ? (
                    <p className="text-xs font-semibold text-amber-100/80">
                      {score.raw} ×2 cette manche
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold tabular-nums">
                    {player.total} pts
                  </p>
                  {score ? (
                    <p className="text-[11px] font-semibold text-white/50 tabular-nums">
                      Manche {score.points}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setBoards((open) => !open)}
        >
          {boards ? "Classement" : "Voir les jeux"}
        </button>
        {view.phase === "between" ? (
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            onClick={() => onAction({ type: "next-round" })}
          >
            Manche suivante
          </button>
        ) : (
          <button type="button" className={primaryButton} onClick={onQuit}>
            Retour à l’accueil
          </button>
        )}
      </div>
    </Shell>
  );
}

const AVATAR = [
  "bg-amber-300 text-[#1a1405]",
  "bg-emerald-400 text-[#052117]",
  "bg-sky-400 text-[#041820]",
  "bg-rose-400 text-[#2a0810]",
  "bg-violet-400 text-[#160826]",
  "bg-orange-400 text-[#2a1204]",
  "bg-teal-300 text-[#04201c]",
  "bg-fuchsia-400 text-[#240818]",
];

function EndGrid({ player }: { player: ViewPlayer }) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-2">
      {player.grid.map((cell, index) => (
        <CardFace
          key={index}
          size="sm"
          value={cell.value}
          faceUp={cell.faceUp}
          empty={cell.empty}
          framed={player.isYou}
          indices={player.isYou}
          settle
          label={
            cell.empty
              ? `Colonne retirée, case ${index + 1}`
              : `${player.name}, ${cell.value ?? "carte"}, case ${index + 1}`
          }
        />
      ))}
    </div>
  );
}

const REVEAL_STEP_MS = 1100;
const REVEAL_HOLD_MS = 1800;

function RoundReveal({
  previous,
  view,
  settings,
  onSettings,
  onQuit,
  onRefresh,
  onDone,
}: {
  previous: GameView;
  view: GameView;
  settings: SkyjoSettings;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
  onQuit: () => void;
  onRefresh: () => void | Promise<void>;
  onDone: () => void;
}) {
  const steps = useMemo(() => revealSteps(previous, view), [previous, view]);
  const basePlayers = useMemo(
    () => gridsAtReveal(previous, view),
    [previous, view]
  );
  const [tick, setTick] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  const flipped = Math.min(tick, steps.length);
  const cleared = Math.max(0, tick - 1);
  const grids = gridsAfter(basePlayers, steps, flipped, cleared);
  const active = steps[Math.min(flipped, steps.length - 1)];
  const player = view.players.find((entry) => entry.id === active?.playerId);
  const before = previous.players.find(
    (entry) => entry.id === active?.playerId
  );
  const grid = active ? grids.get(active.playerId) : undefined;
  const running = grid ? visibleScore(grid) : 0;
  const mine = steps.filter((step) => step.playerId === active?.playerId);
  const shown = mine.filter((step) =>
    steps.slice(0, flipped).some((doneStep) => doneStep === step)
  ).length;

  useEffect(() => {
    if (tick > steps.length) {
      const pause = window.setTimeout(() => done.current(), REVEAL_HOLD_MS);
      return () => window.clearTimeout(pause);
    }
    const timer = window.setTimeout(
      () => setTick((current) => current + 1),
      REVEAL_STEP_MS
    );
    return () => window.clearTimeout(timer);
  }, [tick, steps.length]);

  return (
    <Shell
      code={view.code}
      onQuit={onQuit}
      onRefresh={onRefresh}
      felt
      status="Fin de manche"
      settings={settings}
      onSettings={onSettings}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
        <p className="text-center text-xs font-bold tracking-[0.22em] text-white/45">
          RETOUR DES CARTES
        </p>
        <p className="text-center text-2xl font-extrabold" aria-live="polite">
          {player?.name ?? ""}
        </p>
        {player ? (
          <div className="pt-3">
            <div className="flex items-center rounded-full bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
              <p className="px-3 py-1.5 text-base leading-none font-bold tabular-nums">
                <RoundScore
                  key={player.id}
                  value={running}
                  label={`Score visible ${running}`}
                  idleClass="text-white/70"
                  popClass="text-sm"
                />
              </p>
              <span className="h-5 w-px bg-white/30" aria-hidden="true" />
              <p
                className="px-3 py-1.5 text-lg leading-none font-extrabold tabular-nums"
                aria-label={`Score total ${before?.total ?? player.total}`}
              >
                {before?.total ?? player.total}
              </p>
            </div>
          </div>
        ) : null}
        <p className="text-center text-sm font-bold text-white/60">
          {shown} / {mine.length}
        </p>
        {view.players.map((entry) => (
          <div
            key={entry.id}
            className={`w-full max-w-xs ${entry.id === active?.playerId ? "" : "hidden"}`}
          >
            <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
              {(grids.get(entry.id) ?? entry.grid).map((cell, index) => (
                <CardFace
                  key={index}
                  value={cell.value}
                  faceUp={cell.faceUp}
                  empty={cell.empty}
                  framed={entry.isYou}
                  indices={entry.isYou}
                  label={
                    cell.empty
                      ? `Case ${index + 1} retirée`
                      : cell.faceUp
                        ? `${cell.value}, case ${index + 1}`
                        : `Carte cachée, case ${index + 1}`
                  }
                />
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className={`${secondaryButton} mt-2 max-w-xs`}
          onClick={() => done.current()}
        >
          Passer
        </button>
      </div>
    </Shell>
  );
}

function visibleScore(grid: ViewCell[]) {
  return grid.reduce(
    (total, cell) =>
      total + (cell.faceUp && !cell.empty ? (cell.value ?? 0) : 0),
    0
  );
}

function gridsAtReveal(previous: GameView, view: GameView) {
  const placed = view.placed;
  if (!placed) return previous.players;
  return previous.players.map((player) => {
    if (player.id !== placed.playerId) return player;
    const final = view.players.find((entry) => entry.id === player.id);
    const column = placed.index % 4;
    const slots = [column, column + 4, column + 8];
    const alreadyGone =
      slots.every((slot) => final?.grid[slot]?.empty) &&
      slots.every((slot) => {
        if (slot === placed.index) return true;
        const cell = player.grid[slot];
        return !cell || cell.empty || cell.faceUp;
      });
    return {
      ...player,
      grid: player.grid.map((cell, index) => {
        if (alreadyGone && slots.includes(index)) {
          return { empty: true, faceUp: false, value: null };
        }
        if (index !== placed.index) return cell;
        const now = final?.grid[index];
        if (now && !now.empty && now.faceUp) return { ...now };
        return { empty: false, faceUp: true, value: placed.value };
      }),
    };
  });
}

function revealSteps(previous: GameView, view: GameView) {
  const steps = [...(view.uncovered ?? [])];
  const known = new Set(steps.map((step) => `${step.playerId}:${step.index}`));
  for (const player of previous.players) {
    const final = view.players.find((entry) => entry.id === player.id);
    player.grid.forEach((cell, index) => {
      const key = `${player.id}:${index}`;
      if (
        known.has(key) ||
        cell.empty ||
        cell.faceUp ||
        (view.placed?.playerId === player.id && view.placed.index === index)
      ) {
        return;
      }
      const now = final?.grid[index];
      if (!now || now.empty || !now.faceUp || now.value == null) return;
      const place = steps.findIndex(
        (step) => step.playerId === player.id && step.index > index
      );
      const card = { playerId: player.id, index, value: now.value };
      if (place >= 0) {
        steps.splice(place, 0, card);
      } else {
        const order = previous.players.map((entry) => entry.id);
        const mine = order.indexOf(player.id);
        const lastOwn = steps.findLastIndex(
          (step) => step.playerId === player.id
        );
        const insertAt =
          lastOwn >= 0
            ? lastOwn + 1
            : steps.findIndex((step) => order.indexOf(step.playerId) > mine);
        steps.splice(insertAt >= 0 ? insertAt : steps.length, 0, card);
      }
      known.add(key);
    });
  }
  return steps;
}

function gridsAfter(
  players: ViewPlayer[],
  steps: RevealCard[],
  flipped: number,
  cleared: number
) {
  const grids = new Map<string, ViewCell[]>(
    players.map((player) => [
      player.id,
      player.grid.map((cell) => ({ ...cell })),
    ])
  );
  steps.slice(0, flipped).forEach((step, index) => {
    const grid = grids.get(step.playerId);
    const cell = grid?.[step.index];
    if (!grid || !cell) return;
    grid[step.index] = { empty: false, faceUp: true, value: step.value };
    if (index < cleared) clearShownColumn(grid, step.index);
  });
  return grids;
}

function clearShownColumn(grid: ViewCell[], index: number) {
  const column = index % 4;
  const slots = [column, column + 4, column + 8].map((slot) => grid[slot]);
  const value = slots[0]?.value;
  if (
    slots.some((slot) => !slot || slot.empty || !slot.faceUp) ||
    value === null ||
    value === undefined ||
    slots.some((slot) => slot?.value !== value)
  ) {
    return;
  }
  for (const slot of [column, column + 4, column + 8]) {
    grid[slot] = { empty: true, faceUp: false, value: null };
  }
}

function RankBadge({ place }: { place: number }) {
  const tone =
    place === 1
      ? "bg-amber-300 text-[#1a1405]"
      : place === 2
        ? "bg-zinc-300 text-[#1a1405]"
        : place === 3
          ? "bg-orange-400 text-[#2a1204]"
          : "bg-white/15 text-white/80";
  return (
    <span
      className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${tone}`}
    >
      {place}
    </span>
  );
}

function ranked(players: ViewPlayer[]) {
  const sorted = [...players].sort(
    (a, b) => a.total - b.total || a.name.localeCompare(b.name, "fr")
  );
  let place = 1;
  return sorted.map((player, index) => {
    if (index > 0 && player.total !== sorted[index - 1]?.total) {
      place = index + 1;
    }
    return { player, place };
  });
}

function gameWinners(view: GameView) {
  const winners = view.players.filter((player) =>
    view.winners.includes(player.id)
  );
  return winners.length > 0 ? winners : view.players.slice(0, 1);
}

function roundWinners(view: GameView) {
  const scores = view.summary ?? [];
  if (scores.length === 0) return gameWinners(view);
  const best = Math.min(...scores.map((score) => score.points));
  const ids = new Set(
    scores
      .filter((score) => score.points === best)
      .map((score) => score.playerId)
  );
  const winners = view.players.filter((player) => ids.has(player.id));
  return winners.length > 0 ? winners : gameWinners(view);
}

function roundPoints(view: GameView, playerId: string | undefined) {
  return (
    view.summary?.find((score) => score.playerId === playerId)?.points ?? 0
  );
}

function standingLine(
  you: { player: ViewPlayer; place: number },
  placed: { player: ViewPlayer; place: number }[]
) {
  const shared =
    placed.filter((entry) => entry.player.total === you.player.total).length >
    1;
  if (you.place === 1) {
    return shared ? "Tu partages la première place" : "Tu es en tête";
  }
  const gap = you.player.total - (placed[0]?.player.total ?? you.player.total);
  return `Tu es ${placeLabel(you.place)} · ${gap} pts du premier`;
}

function placeLabel(place: number) {
  return place === 1 ? "1er" : `${place}e`;
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

function initial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

const primaryButton =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 text-lg font-extrabold text-[#1a1405] disabled:opacity-40";
const secondaryButton =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 font-bold disabled:opacity-40";
