import type { GameView, ViewCell } from "@/lib/skyjo/types";

export type OpponentMotion =
  | { kind: "draw" }
  | { kind: "take"; value: number; pile: number | null }
  | { kind: "discard"; value: number; pile: number | null }
  | {
      kind: "swap";
      playerId: string;
      index: number;
      incoming: number;
      outgoing: number;
      hidden: boolean;
      held: boolean;
      fromDeck: boolean;
      fromDiscard: boolean;
      before: ViewCell;
      pile: number | null;
      cleared: { index: number; value: number }[];
    };

export function opponentMotion(
  prev: GameView,
  next: GameView
): OpponentMotion | null {
  if (prev.revision === next.revision || prev.round !== next.round) return null;
  if (
    prev.phase === "lobby" ||
    next.phase === "lobby" ||
    prev.phase === "between" ||
    prev.phase === "over" ||
    next.phase === "between" ||
    next.phase === "over"
  ) {
    return null;
  }

  const actor = prev.currentPlayerId;
  if (!actor || actor === prev.youId) return null;
  const before = prev.players.find((player) => player.id === actor);
  const after = next.players.find((player) => player.id === actor);
  if (!before || !after) return null;
  const changed = changedIndexes(before.grid, after.grid);

  if (
    !prev.opponentHolding &&
    next.opponentHolding &&
    next.currentPlayerId === actor
  ) {
    if (next.holdFromDeck) return { kind: "draw" };
    if (next.opponentHand != null) {
      return { kind: "take", value: next.opponentHand, pile: prev.discardTop };
    }
  }

  if (
    prev.opponentHolding &&
    !next.opponentHolding &&
    changed.length === 0 &&
    prev.holdFromDeck &&
    next.discardTop != null
  ) {
    return {
      kind: "discard",
      value: next.discardTop,
      pile: prev.discardTop,
    };
  }

  if (prev.opponentHolding && !next.opponentHolding && changed.length > 0) {
    return swapMotion(
      before.grid,
      after.grid,
      changed,
      prev,
      next,
      actor,
      true
    );
  }

  if (
    !prev.opponentHolding &&
    !next.opponentHolding &&
    changed.length > 0 &&
    prev.discardTop !== next.discardTop &&
    !flipsOnly(before.grid, after.grid, changed)
  ) {
    return swapMotion(
      before.grid,
      after.grid,
      changed,
      prev,
      next,
      actor,
      false
    );
  }

  return null;
}

function swapMotion(
  before: ViewCell[],
  after: ViewCell[],
  changed: number[],
  prev: GameView,
  next: GameView,
  actor: string,
  sawHold: boolean
): OpponentMotion | null {
  const exchange = next.exchange?.playerId === actor ? next.exchange : null;
  const index =
    exchange?.index ??
    changed.find((slot) => {
      const cell = before[slot];
      return Boolean(cell && !cell.empty && !cell.faceUp);
    }) ??
    changed[0];
  if (index === undefined) return null;
  const previous = before[index];
  if (!previous || previous.empty) return null;
  const placed = after[index];
  const incoming =
    placed && !placed.empty && placed.value != null
      ? placed.value
      : columnValue(before, after, index);
  const outgoing = exchange?.value ?? (placed?.empty ? null : next.discardTop);
  if (incoming == null || outgoing == null) return null;
  const cleared = changed
    .filter((slot) => after[slot]?.empty && before[slot] && !before[slot].empty)
    .map((slot) => ({
      index: slot,
      value: slot === index ? incoming : (before[slot]?.value ?? incoming),
    }));
  const fromDiscard = sawHold
    ? !prev.holdFromDeck
    : incoming === prev.discardTop;
  return {
    kind: "swap",
    playerId: actor,
    index,
    incoming,
    outgoing,
    hidden: exchange?.hidden ?? !previous.faceUp,
    held: sawHold,
    fromDeck: sawHold ? prev.holdFromDeck : !fromDiscard,
    fromDiscard,
    before: previous,
    pile: prev.discardTop,
    cleared,
  };
}

function flipsOnly(before: ViewCell[], after: ViewCell[], changed: number[]) {
  return changed.every((slot) => {
    const old = before[slot];
    const next = after[slot];
    return Boolean(
      old && next && !old.empty && !old.faceUp && !next.empty && next.faceUp
    );
  });
}

function columnValue(before: ViewCell[], after: ViewCell[], index: number) {
  const column = index % 4;
  for (const slot of [column, column + 4, column + 8]) {
    const cell = before[slot];
    if (
      slot !== index &&
      cell &&
      !cell.empty &&
      cell.faceUp &&
      cell.value != null &&
      after[slot]?.empty
    ) {
      return cell.value;
    }
  }
  return null;
}

function changedIndexes(before: ViewCell[], after: ViewCell[]) {
  const changed: number[] = [];
  const count = Math.max(before.length, after.length);
  for (let index = 0; index < count; index += 1) {
    const left = before[index];
    const right = after[index];
    if (
      !left ||
      !right ||
      left.empty !== right.empty ||
      left.faceUp !== right.faceUp ||
      left.value !== right.value
    ) {
      changed.push(index);
    }
  }
  return changed;
}
