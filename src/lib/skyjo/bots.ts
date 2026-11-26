import { COLS, columnSlots } from "@/lib/skyjo/cards";
import { applyAction, canDraw, faceUpCount } from "@/lib/skyjo/engine";
import type { Action, Player, Room } from "@/lib/skyjo/types";

export const BOT_BEAT_MS = 1000;

export function stepBot(room: Room, rng: () => number = Math.random): Room {
  const suggestion = suggest(room, rng);
  if (!suggestion) return room;
  const step = applyAction(room, suggestion.playerId, suggestion.action, rng);
  return step.ok ? step.state : room;
}

export function suggest(
  room: Room,
  rng: () => number = Math.random
): { playerId: string; action: Action } | null {
  if (room.phase.kind === "opening") {
    const bot = room.players.find(
      (player) => player.isBot && faceUpCount(player) < 2
    );
    if (!bot) return null;
    const index = bot.grid.findIndex((slot) => slot && !slot.faceUp);
    if (index < 0) return null;
    return { playerId: bot.id, action: { type: "flip", index } };
  }

  if (
    room.phase.kind !== "choose" &&
    room.phase.kind !== "hold" &&
    room.phase.kind !== "flip"
  ) {
    return null;
  }

  const player = room.players[room.current];
  if (!player?.isBot) return null;

  if (room.phase.kind === "choose") {
    return {
      playerId: player.id,
      action: wantsDiscard(room, player)
        ? { type: "take-discard" }
        : { type: "draw" },
    };
  }

  if (room.phase.kind === "hold") {
    const incoming = room.phase.card.value;
    const swapIndex = bestSwap(player, incoming);
    if (swapIndex !== null) {
      return {
        playerId: player.id,
        action: { type: "swap", index: swapIndex },
      };
    }
    if (!room.phase.fromDeck) {
      const fallback = firstOccupied(player);
      if (fallback === null) return null;
      return { playerId: player.id, action: { type: "swap", index: fallback } };
    }
    return { playerId: player.id, action: { type: "discard-drawn" } };
  }

  const index = bestFlip(player, rng);
  if (index === null) return null;
  return { playerId: player.id, action: { type: "flip", index } };
}

function wantsDiscard(room: Room, player: Player) {
  const top = room.discard.at(-1)?.value;
  if (top === undefined) return false;
  if (!canDraw(room)) return true;
  if (completionIndex(player, top) !== null && top > 0) return true;
  return (
    bestReplacement(player, top) !== null ||
    (top <= 1 && hiddenIndexes(player).length > 0)
  );
}

function bestSwap(player: Player, incoming: number) {
  if (incoming > 0) {
    const complete = completionIndex(player, incoming);
    if (complete !== null) return complete;
  }
  const replacement = bestReplacement(player, incoming);
  if (replacement !== null) return replacement;
  const hidden = hiddenIndexes(player);
  if (incoming <= 1 && hidden.length > 0) return hidden[0] ?? null;
  if (hidden.length === 1 && !shouldClose(player, incoming)) {
    return highestFaceUp(player);
  }
  if (incoming <= 3 && hidden.length > 0) return hidden[0] ?? null;
  return null;
}

function shouldClose(player: Player, incoming: number) {
  const known = player.grid.reduce((total, slot) => {
    if (!slot || !slot.faceUp) return total;
    return total + slot.value;
  }, 0);
  return known + incoming <= 8;
}

function bestFlip(player: Player, rng: () => number) {
  for (let column = 0; column < COLS; column += 1) {
    const slots = columnSlots(column).map((index) => ({
      index,
      slot: player.grid[index],
    }));
    const visible = slots.filter((entry) => entry.slot?.faceUp);
    const hidden = slots.filter((entry) => entry.slot && !entry.slot.faceUp);
    if (
      visible.length === 2 &&
      hidden.length === 1 &&
      visible[0]?.slot?.value === visible[1]?.slot?.value &&
      (visible[0]?.slot?.value ?? 0) > 0
    ) {
      return hidden[0]?.index ?? null;
    }
  }
  const hidden = hiddenIndexes(player);
  if (hidden.length === 0) return null;
  return hidden[Math.floor(rng() * hidden.length)] ?? null;
}

function completionIndex(player: Player, value: number) {
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const slots = indexes.map((index) => player.grid[index]);
    const hidden = indexes.filter((index) => {
      const slot = player.grid[index];
      return slot && !slot.faceUp;
    });
    const faceUp = slots.filter((slot) => slot?.faceUp);
    if (
      hidden.length === 1 &&
      faceUp.length === 2 &&
      faceUp.every((slot) => slot && slot.value === value)
    ) {
      return hidden[0] ?? null;
    }
  }
  return null;
}

function bestReplacement(player: Player, incoming: number) {
  let bestIndex: number | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < player.grid.length; index += 1) {
    const slot = player.grid[index];
    if (
      !slot?.faceUp ||
      slot.value <= incoming ||
      protectedPair(player, index)
    ) {
      continue;
    }
    if (slot.value > bestValue) {
      bestIndex = index;
      bestValue = slot.value;
    }
  }
  return bestIndex;
}

function protectedPair(player: Player, index: number) {
  const slot = player.grid[index];
  if (!slot?.faceUp || slot.value > 5) return false;
  const column = index % COLS;
  const slots = columnSlots(column).map((slotIndex) => player.grid[slotIndex]);
  const same = slots.filter(
    (entry) => entry?.faceUp && entry.value === slot.value
  );
  const hidden = slots.filter((entry) => entry && !entry.faceUp);
  return same.length === 2 && hidden.length === 1;
}

function highestFaceUp(player: Player) {
  let bestIndex: number | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < player.grid.length; index += 1) {
    const slot = player.grid[index];
    if (!slot?.faceUp || slot.value <= bestValue) continue;
    bestIndex = index;
    bestValue = slot.value;
  }
  return bestIndex ?? hiddenIndexes(player)[0] ?? null;
}

function hiddenIndexes(player: Player) {
  const indexes: number[] = [];
  player.grid.forEach((slot, index) => {
    if (slot && !slot.faceUp) indexes.push(index);
  });
  return indexes;
}

function firstOccupied(player: Player) {
  const index = player.grid.findIndex((slot) => slot);
  return index === -1 ? null : index;
}
