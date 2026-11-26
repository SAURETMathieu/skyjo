"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
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
  Settings,
  Share2,
} from "lucide-react";

import { useSkyjoSettings, type SkyjoSettings } from "@/lib/skyjo/settings";
import type { Action, GameView, ViewPlayer } from "@/lib/skyjo/types";
import { CardFace } from "@/components/skyjo/CardFace";

type PlayAction = (
  action: Action
) => GameView | null | Promise<GameView | null>;

export function GameScreen({
  view,
  onAction,
  onQuit,
  busy = false,
  error,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const { settings, ready, update } = useSkyjoSettings();
  if (view.phase === "lobby") {
    return (
      <Lobby
        view={view}
        onAction={onAction}
        onQuit={onQuit}
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
      busy={busy}
      error={error}
      settings={settings}
      settingsReady={ready}
      onSettings={update}
    />
  );
}

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
  onQuit,
  felt = false,
  status,
  yours = false,
  callout = null,
  settings,
  onSettings,
}: {
  children: ReactNode;
  onQuit: () => void;
  felt?: boolean;
  status?: string;
  yours?: boolean;
  callout?: { title: string; detail?: string; tone: "turn" | "finale" } | null;
  settings: SkyjoSettings;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [options, setOptions] = useState(false);
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
        <div className="flex items-center justify-self-end">
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
  busy,
  error,
  settings,
  onSettings,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
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
    <Shell onQuit={onQuit} settings={settings} onSettings={onSettings}>
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
  settings,
  settingsReady,
  onSettings,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  busy: boolean;
  error?: string | null;
  settings: SkyjoSettings;
  settingsReady: boolean;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const you = view.players.find((player) => player.isYou);
  const others = view.players.filter((player) => !player.isYou);
  const presenceKey = others
    .map((player) => `${player.id}:${player.connected}:${player.left}`)
    .join("|");

  const current = view.players.find((player) => player.current);
  const spotlight = view.phase !== "opening";
  const holding = view.hand !== null || view.opponentHolding;
  const revealedHold = view.hand ?? view.opponentHand;
  const drawn = holding && view.holdFromDeck;
  const taken = holding && !view.holdFromDeck;
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CardDrag | null>(null);
  const pickTask = useRef<Promise<GameView | null> | null>(null);
  const blockClick = useRef(false);
  const stopListeners = useRef<(() => void) | null>(null);
  const flightSeq = useRef(0);
  const viewRef = useRef(view);
  const onActionRef = useRef(onAction);
  const busyRef = useRef(busy);
  viewRef.current = view;
  onActionRef.current = onAction;
  busyRef.current = busy;
  const [rows, setRows] = useState(1);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [covered, setCovered] = useState<CoveredCell | null>(null);
  const [settled, setSettled] = useState<number | null>(null);
  const [hideHold, setHideHold] = useState(false);
  const [drag, setDrag] = useState<CardDrag | null>(null);
  const [locking, setLocking] = useState<null | "deck" | "discard">(null);
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
  }, [others.length, view.revision, presenceKey]);

  useEffect(() => () => stopListeners.current?.(), []);

  function resolveAction(
    result: GameView | null | Promise<GameView | null>
  ): Promise<GameView | null> {
    return Promise.resolve(result).then((next) => next ?? null);
  }

  function placeCard(index: number, target: HTMLElement) {
    const value = view.hand;
    const source = document.querySelector("[data-skyjo-held]");
    if (value === null || !source) {
      void resolveAction(onAction({ type: "swap", index }));
      return;
    }
    const finish = launchCard(
      index,
      value,
      source.getBoundingClientRect(),
      target.getBoundingClientRect()
    );
    const result = onAction({ type: "swap", index });
    if (result instanceof Promise)
      void result.then((next) => finish(next != null));
    else finish(result != null);
  }

  function launchCard(index: number | null, value: number, from: Box, to: Box) {
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
    setFlights((list) => [...list, { id, value, from, to }]);
    if (previous && !previous.empty && index !== null) {
      setCovered({
        index,
        faceUp: previous.faceUp,
        value: previous.value,
        empty: previous.empty,
      });
    }
    setHideHold(true);
    if (index !== null) setSettled(index);
    return (ok: boolean) => {
      const clear = () => {
        setFlights((list) => list.filter((item) => item.id !== id));
        setHideHold(false);
        if (index !== null) {
          setCovered((current) => (current?.index === index ? null : current));
          setSettled((current) => (current === index ? null : current));
        }
      };
      if (!ok) {
        clear();
        return;
      }
      const elapsed = performance.now() - started;
      window.setTimeout(
        () => {
          if (index !== null) {
            setCovered((current) =>
              current?.index === index ? null : current
            );
          }
        },
        Math.max(0, 430 - elapsed)
      );
      window.setTimeout(clear, Math.max(0, 480 - elapsed));
    };
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
      const card = node.querySelector("button, [role='img']");
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
    const card = slot?.querySelector("button, [role='img']");
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
    if (event.button !== 0 || busyRef.current || dragRef.current) return;
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
    if (!moved || cancelled) {
      clearDrag();
      return;
    }
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
      const next = await resolveAction(
        onActionRef.current({ type: "discard-drawn" })
      );
      clearDrag();
      if (next == null) setHideHold(false);
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
      const finish = launchCard(overCell, origin.value, from, target);
      const taken = await resolveAction(
        onActionRef.current({ type: "take-discard" })
      );
      if (taken?.hand == null) {
        setLocking(null);
        finish(false);
        return;
      }
      const swapped = await resolveAction(
        onActionRef.current({ type: "swap", index: overCell })
      );
      setLocking(null);
      finish(swapped != null);
      return;
    }
    if (origin.source === "deck") {
      const drawn = await pickDeck();
      if (drawn?.hand == null) {
        clearDrag();
        return;
      }
      clearDrag();
      const finish = launchCard(overCell, drawn.hand, from, target);
      const swapped = await resolveAction(
        onActionRef.current({ type: "swap", index: overCell })
      );
      finish(swapped != null);
      return;
    }
    if (origin.value === null) {
      clearDrag();
      return;
    }
    clearDrag();
    const finish = launchCard(overCell, origin.value, from, target);
    const swapped = await resolveAction(
      onActionRef.current({ type: "swap", index: overCell })
    );
    finish(swapped != null);
  }

  function guarded(action: () => void) {
    if (blockClick.current) {
      blockClick.current = false;
      return;
    }
    action();
  }

  return (
    <Shell
      onQuit={onQuit}
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
                !busy &&
                (view.actions.swap || view.actions.discardDrawn)
                  ? {
                      onPointerDown: (event) => startDrag("drawn", event),
                    }
                  : undefined
              }
              onPointerDown={
                view.actions.draw && view.hand === null && !busy
                  ? (event) => startDrag("deck", event)
                  : undefined
              }
              enabled={view.actions.draw && !busy}
              onClick={() => guarded(() => onAction({ type: "draw" }))}
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
                  data-skyjo-discard-drop
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
                view.hand !== null &&
                !view.holdFromDeck &&
                view.actions.swap &&
                !busy
                  ? {
                      onPointerDown: (event) => startDrag("taken", event),
                    }
                  : undefined
              }
              onPointerDown={
                view.actions.takeDiscard && !busy
                  ? (event) => startDrag("discard", event)
                  : undefined
              }
              enabled={view.actions.takeDiscard && !busy}
              onClick={() => guarded(() => onAction({ type: "take-discard" }))}
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
                <PresenceNote player={you} />
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
                const shown = covered?.index === index ? covered : cell;
                const canSwap =
                  view.actions.swap && !cell.empty && covered === null;
                const canFlip =
                  view.actions.flip && !cell.empty && !cell.faceUp;
                const column = (index % 4) + 1;
                const row = Math.floor(index / 4) + 1;
                return (
                  <div
                    key={`${you.id}-${index}`}
                    data-skyjo-cell={index}
                    className="contents"
                  >
                    <CardFace
                      value={shown.value}
                      faceUp={shown.faceUp}
                      empty={shown.empty}
                      indices
                      framed
                      settle={settled === index}
                      highlight={
                        drag?.moved === true && drag.overCell === index
                      }
                      interactive={canSwap || canFlip}
                      onClick={
                        canSwap || canFlip
                          ? (element) => {
                              if (canSwap) placeCard(index, element);
                              else onAction({ type: "flip", index });
                            }
                          : undefined
                      }
                      label={
                        shown.empty
                          ? `Colonne ${column}, ligne ${row}, vide`
                          : shown.faceUp
                            ? `Colonne ${column}, ligne ${row}, ${shown.value}`
                            : `Colonne ${column}, ligne ${row}, cachée`
                      }
                    />
                  </div>
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
  value: number;
  from: Box;
  to: Box;
};

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
      <CardFace faceUp value={flight.value} label="Carte posée" />
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

function PresenceNote({ player }: { player: ViewPlayer }) {
  if (player.isBot || (player.connected && !player.left)) return null;
  return (
    <span className="shrink-0 text-xs font-semibold text-rose-200">
      {player.left ? "A quitté" : "Hors ligne"}
    </span>
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
      <p className="flex items-center gap-1 text-[10px] leading-none">
        <Presence player={player} />
        <span
          className={`min-w-0 flex-1 truncate text-[11px] font-extrabold ${
            player.left
              ? "text-rose-200"
              : active
                ? "text-amber-100"
                : "text-white/75"
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
      {player.left || (!player.isBot && !player.connected) ? (
        <p className="mt-0.5 truncate text-[9px] leading-3 font-bold text-rose-200">
          {player.left ? "A quitté" : "Hors ligne"}
        </p>
      ) : null}
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
  pileRef,
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
    <div ref={pileRef} className="flex w-12 flex-col items-center">
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
  busy,
  settings,
  onSettings,
}: {
  view: GameView;
  onAction: PlayAction;
  onQuit: () => void;
  busy: boolean;
  settings: SkyjoSettings;
  onSettings: (patch: Partial<SkyjoSettings>) => void;
}) {
  const ranking = [...view.players].sort((a, b) => a.total - b.total);
  return (
    <Shell onQuit={onQuit} settings={settings} onSettings={onSettings}>
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
                <p className="flex min-w-0 items-center gap-1.5 font-extrabold">
                  <Presence player={player} />
                  <span className="truncate">
                    {view.phase === "over" ? `${index + 1}. ` : ""}
                    {player.name}
                    {winner ? " · gagne" : ""}
                  </span>
                  <PresenceNote player={player} />
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
