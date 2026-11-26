import { COLS, columnSlots, DISTRIBUTION } from "@/lib/skyjo/cards";
import { applyAction, canDraw, faceUpCount } from "@/lib/skyjo/engine";
import {
  isBotLevel,
  type Action,
  type BotLevel,
  type Player,
  type Room,
} from "@/lib/skyjo/types";

export const BOT_BEAT_MS = 1000;

type Strength = Exclude<BotLevel, "easy">;
type PlaceMode = "voluntary" | "keep" | "forced";

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
    const level = levelOf(bot);
    const index =
      level === "easy"
        ? firstHidden(bot)
        : level === "extreme"
          ? worstHidden(bot)
          : spreadHidden(bot);
    if (index === null) return null;
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
  const level = levelOf(player);

  if (room.phase.kind === "choose") {
    return {
      playerId: player.id,
      action:
        level === "easy"
          ? wantsDiscardEasy(room, player)
            ? { type: "take-discard" }
            : { type: "draw" }
          : wantsDiscard(room, player, level)
            ? { type: "take-discard" }
            : { type: "draw" },
    };
  }

  if (room.phase.kind === "hold") {
    const incoming = room.phase.card.value;
    if (level === "easy") {
      const swapIndex = bestSwapEasy(player, incoming);
      if (swapIndex !== null) {
        return {
          playerId: player.id,
          action: { type: "swap", index: swapIndex },
        };
      }
      if (!room.phase.fromDeck) {
        const fallback = firstOccupied(player);
        if (fallback === null) return null;
        return {
          playerId: player.id,
          action: { type: "swap", index: fallback },
        };
      }
      return { playerId: player.id, action: { type: "discard-drawn" } };
    }
    return placeHeld(room, player, level);
  }

  const index =
    level === "easy"
      ? bestFlipEasy(player, rng)
      : chooseFlip(player, level, rng);
  if (index === null) return null;
  return { playerId: player.id, action: { type: "flip", index } };
}

function levelOf(player: Player): BotLevel {
  return isBotLevel(player.botLevel) ? player.botLevel : "normal";
}

function informed(level: Strength) {
  return level === "hard" || level === "extreme";
}

function wantsDiscard(room: Room, player: Player, level: Strength) {
  const top = room.discard.at(-1)?.value;
  if (top === undefined) return false;
  if (!canDraw(room)) return true;
  return bestOffer(room, player, top, level, "voluntary") !== null;
}

function placeHeld(
  room: Room,
  player: Player,
  level: Strength
): { playerId: string; action: Action } | null {
  if (room.phase.kind !== "hold") return null;
  const incoming = room.phase.card.value;
  const fromDeck = room.phase.fromDeck;
  const offer = bestOffer(
    room,
    player,
    incoming,
    level,
    fromDeck ? "keep" : "forced"
  );
  if (offer !== null) {
    return { playerId: player.id, action: { type: "swap", index: offer } };
  }
  if (!fromDeck) {
    const fallback = forcedFallback(room, player, incoming, level);
    if (fallback === null) return null;
    return { playerId: player.id, action: { type: "swap", index: fallback } };
  }
  const hidden = hiddenIndexes(player);
  if (hidden.length === 1) {
    if (worstFlipStillWins(room, player, level)) {
      return { playerId: player.id, action: { type: "discard-drawn" } };
    }
    const cover = coverIndex(player, incoming, level);
    if (cover !== null) {
      return {
        playerId: player.id,
        action: { type: "swap", index: cover },
      };
    }
  }
  return { playerId: player.id, action: { type: "discard-drawn" } };
}

function bestOffer(
  room: Room,
  player: Player,
  incoming: number,
  level: Strength,
  mode: PlaceMode
) {
  const stats = unseenStats(room);
  const offers: { index: number; saved: number }[] = [];
  if (incoming > 0) {
    const complete = completionIndex(player, incoming);
    if (complete !== null)
      offers.push({ index: complete, saved: incoming * 2 });
  }
  const replacement = bestReplacement(
    player,
    incoming,
    level,
    stats.average,
    mode
  );
  if (replacement !== null) {
    const slot = player.grid[replacement];
    if (slot?.faceUp) {
      offers.push({ index: replacement, saved: slot.value - incoming });
    }
  }
  const hidden = hiddenIndexes(player);
  if (level === "extreme") {
    const setup = columnSetup(player, incoming);
    if (setup) offers.push(setup);
    const dump = knownDump(player, incoming);
    if (dump !== null) {
      const buried = player.grid[dump]?.value ?? incoming;
      offers.push({ index: dump, saved: buried - incoming });
    }
  }
  if (hidden.length === 1 && closingPays(room, player, incoming, level)) {
    const last = hidden[0] ?? 0;
    const score = closeScore(player, last, incoming);
    offers.push({
      index: last,
      saved: informed(level)
        ? 1000 - score
        : Math.max(8, stats.average - incoming),
    });
  } else if (
    hidden.length > 1 &&
    level !== "extreme" &&
    (level === "normal" ? incoming <= 0 : incoming <= stats.average - 4)
  ) {
    offers.push({
      index: hidden[0] ?? 0,
      saved: stats.average - incoming,
    });
  }
  if (mode !== "voluntary" && incoming >= 6 && stats.count(incoming) >= 4) {
    const parked = pairSlot(player, incoming);
    if (parked !== null) offers.push({ index: parked, saved: 2.5 });
  }
  const last = hidden.length === 1 ? hidden[0] : undefined;
  const kept =
    informed(level) && last !== undefined
      ? offers.flatMap((offer) => {
          if (offer.index !== last) return [offer];
          const score = closeScore(player, last, incoming);
          return sureWin(room, player.id, score)
            ? [{ index: offer.index, saved: 1000 - score }]
            : [];
        })
      : offers;
  kept.sort((a, b) => b.saved - a.saved || a.index - b.index);
  return kept[0]?.index ?? null;
}

function enoughGain(
  level: Strength,
  mode: PlaceMode,
  faceUp: number,
  incoming: number,
  expectation: number
) {
  const gain = faceUp - incoming;
  if (gain <= 0) return false;
  if (mode === "forced") return true;
  if (level === "normal") return faceUp >= 9 ? gain >= 1 : gain >= 4;
  return incoming <= expectation ? gain >= 2 : gain >= 4;
}

function bestReplacement(
  player: Player,
  incoming: number,
  level: Strength,
  expectation: number,
  mode: PlaceMode
) {
  let bestIndex: number | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < player.grid.length; index += 1) {
    const slot = player.grid[index];
    if (
      !slot?.faceUp ||
      guarded(player, index, incoming, level) ||
      (level === "extreme" &&
        keepsColumn(player, index) &&
        slot.value - incoming < slot.value * 2) ||
      !enoughGain(level, mode, slot.value, incoming, expectation)
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

function guarded(
  player: Player,
  index: number,
  incoming: number,
  level: Strength
) {
  const slot = player.grid[index];
  if (!slot?.faceUp) return false;
  const slots = columnSlots(index % COLS).map(
    (slotIndex) => player.grid[slotIndex]
  );
  const same = slots.filter(
    (entry) => entry?.faceUp && entry.value === slot.value
  );
  const hidden = slots.filter((entry) => entry && !entry.faceUp);
  if (same.length !== 2 || hidden.length !== 1) return false;
  if (slot.value <= 1) return true;
  if (level === "normal" && slot.value <= 4) return true;
  return informed(level) && slot.value >= 6 && slot.value - incoming < 6;
}

function closingPays(
  room: Room,
  player: Player,
  incoming: number,
  level: Strength
) {
  if (hiddenIndexes(player).length !== 1) return false;
  if (level === "normal") return sumFaceUp(player) + incoming <= 8;
  const last = hiddenIndexes(player)[0];
  if (last === undefined) return false;
  return sureWin(room, player.id, closeScore(player, last, incoming));
}

function worstFlipStillWins(room: Room, player: Player, level: Strength) {
  const hidden = hiddenIndexes(player);
  if (hidden.length !== 1 || !informed(level)) return false;
  const last = hidden[0];
  if (last === undefined) return false;
  const worst =
    level === "extreme"
      ? (player.grid[last]?.value ?? 0)
      : highestValue(unseenStats(room).counts);
  return sureWin(room, player.id, sumFaceUp(player) + worst);
}

function closeScore(player: Player, index: number, incoming: number) {
  const column = columnSlots(index % COLS);
  const placed = column.map((slotIndex) => {
    if (slotIndex === index) return incoming;
    const slot = player.grid[slotIndex];
    return slot?.faceUp ? slot.value : null;
  });
  const clears =
    placed.every((value) => value !== null) &&
    placed.every((value) => value === placed[0]);
  let score = 0;
  player.grid.forEach((slot, slotIndex) => {
    if (clears && column.includes(slotIndex)) return;
    if (slotIndex === index) {
      score += incoming;
      return;
    }
    if (slot?.faceUp) score += slot.value;
  });
  return score;
}

function sureWin(room: Room, selfId: string, score: number) {
  const counts = unseenStats(room).counts;
  let compared = false;
  for (const player of room.players) {
    if (player.id === selfId) continue;
    compared = true;
    if (!(score < opponentFloor(player, counts))) return false;
  }
  return compared;
}

function opponentFloor(player: Player, counts: Map<number, number>) {
  const hidden = hiddenIndexes(player).length;
  const reserved = drawLowest(counts, hidden);
  const draw = lowestValue(reserved.rest);
  const peak = highestFaceUpValue(player);
  const swing = peak === null ? 0 : Math.max(0, peak - draw);
  return sumFaceUp(player) + reserved.sum - swing;
}

function drawLowest(counts: Map<number, number>, amount: number) {
  const rest = new Map(counts);
  let left = amount;
  let sum = 0;
  for (const value of [...rest.keys()].sort((a, b) => a - b)) {
    if (left === 0) break;
    const have = rest.get(value) ?? 0;
    const take = Math.min(have, left);
    if (take === 0) continue;
    sum += value * take;
    rest.set(value, have - take);
    left -= take;
  }
  return { sum, rest };
}

function lowestValue(counts: Map<number, number>) {
  let best: number | null = null;
  for (const [value, count] of counts) {
    if (count <= 0) continue;
    if (best === null || value < best) best = value;
  }
  return best ?? 0;
}

function highestValue(counts: Map<number, number>) {
  let best: number | null = null;
  for (const [value, count] of counts) {
    if (count <= 0) continue;
    if (best === null || value > best) best = value;
  }
  return best ?? 12;
}

function highestFaceUpValue(player: Player) {
  let best: number | null = null;
  for (const slot of player.grid) {
    if (!slot?.faceUp) continue;
    if (best === null || slot.value > best) best = slot.value;
  }
  return best;
}

function forcedFallback(
  room: Room,
  player: Player,
  incoming: number,
  level: Strength
) {
  const hidden = hiddenIndexes(player);
  const cover = coverIndex(player, incoming, level);
  const expectation = unseenStats(room).average;
  const coverCost =
    cover === null
      ? Number.POSITIVE_INFINITY
      : incoming - faceValue(player, cover);
  const buryCost = incoming - expectation;
  if (level === "extreme") {
    const setup = columnSetup(player, incoming);
    if (setup) return setup.index;
    const dump = knownDump(player, incoming);
    if (hidden.length === 1 && closingPays(room, player, incoming, level)) {
      return hidden[0] ?? null;
    }
    if (dump !== null) {
      const dumpGain = (player.grid[dump]?.value ?? incoming) - incoming;
      const coverGain =
        cover === null
          ? Number.NEGATIVE_INFINITY
          : faceValue(player, cover) - incoming;
      if (dumpGain > coverGain) return dump;
    }
    return cover ?? firstOccupied(player);
  }
  if (
    hidden.length > 1 &&
    buryCost < coverCost &&
    !closingPays(room, player, incoming, level)
  ) {
    return pairSlot(player, incoming) ?? hidden[0] ?? null;
  }
  if (hidden.length === 1 && closingPays(room, player, incoming, level)) {
    return hidden[0] ?? null;
  }
  return cover ?? hidden[0] ?? firstOccupied(player);
}

function coverIndex(player: Player, incoming: number, level: Strength) {
  let openIndex: number | null = null;
  let openValue = Number.NEGATIVE_INFINITY;
  let anyIndex: number | null = null;
  let anyValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < player.grid.length; index += 1) {
    const slot = player.grid[index];
    if (!slot?.faceUp) continue;
    if (slot.value > anyValue) {
      anyIndex = index;
      anyValue = slot.value;
    }
    if (
      guarded(player, index, incoming, level) ||
      (level === "extreme" &&
        keepsColumn(player, index) &&
        slot.value !== incoming) ||
      slot.value <= openValue
    ) {
      continue;
    }
    openIndex = index;
    openValue = slot.value;
  }
  return openIndex ?? anyIndex;
}

function faceValue(player: Player, index: number) {
  const slot = player.grid[index];
  return slot?.faceUp ? slot.value : 0;
}

function pairSlot(player: Player, incoming: number) {
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const faceUp = indexes.filter((index) => player.grid[index]?.faceUp);
    const hidden = indexes.filter((index) => {
      const slot = player.grid[index];
      return slot && !slot.faceUp;
    });
    if (
      faceUp.length === 1 &&
      player.grid[faceUp[0] ?? -1]?.value === incoming &&
      hidden.length > 0
    ) {
      return hidden[0] ?? null;
    }
  }
  return null;
}

function chooseFlip(player: Player, level: Strength, rng: () => number) {
  if (level === "extreme") {
    const known = revealColumn(player);
    if (known !== null) return known;
  }
  const minimum = informed(level) ? 4 : 3;
  for (let column = 0; column < COLS; column += 1) {
    const slots = columnSlots(column).map((index) => ({
      index,
      slot: player.grid[index],
    }));
    const visible = slots.filter((entry) => entry.slot?.faceUp);
    const hidden = slots.filter((entry) => entry.slot && !entry.slot.faceUp);
    const value = visible[0]?.slot?.value ?? 0;
    if (
      level !== "extreme" &&
      visible.length === 2 &&
      hidden.length === 1 &&
      visible.every((entry) => entry.slot?.value === value) &&
      value >= minimum
    ) {
      return hidden[0]?.index ?? null;
    }
  }
  const hidden = hiddenIndexes(player);
  if (hidden.length === 0) return null;
  const avoid = new Set<number>();
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const visible = indexes
      .map((index) => player.grid[index])
      .filter((slot) => slot?.faceUp);
    const buried = indexes.filter((index) => {
      const slot = player.grid[index];
      return slot && !slot.faceUp;
    });
    const value = visible[0]?.value ?? 0;
    if (
      visible.length === 2 &&
      buried.length === 1 &&
      visible.every((slot) => slot?.value === value) &&
      value <= 1
    ) {
      const blocked = buried[0];
      if (blocked !== undefined) avoid.add(blocked);
    }
  }
  let pool = hidden.filter((index) => !avoid.has(index));
  if (pool.length === 0) pool = hidden;
  if (level === "extreme") {
    const banned = negativeColumn(player);
    const quiet = pool.filter(
      (index) => !banned.has(index) && !keepsColumn(player, index)
    );
    const options =
      quiet.length > 0 ? quiet : pool.filter((index) => !banned.has(index));
    const choices = options.length > 0 ? options : pool;
    return choices.reduce((best, index) => {
      const value = player.grid[index]?.value ?? 0;
      const bestValue = player.grid[best]?.value ?? 0;
      return value < bestValue ? index : best;
    });
  }
  if (level === "hard") {
    const high = pool.filter(
      (index) => (columnPeak(player, index) ?? -100) >= 8
    );
    if (high.length > 0) pool = high;
    else {
      const blank = pool.filter((index) => columnPeak(player, index) === null);
      if (blank.length > 0) pool = blank;
    }
    return pool[Math.floor(rng() * pool.length)] ?? null;
  }
  let best = pool[0] ?? null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const index of pool) {
    const value = columnPeak(player, index) ?? -100;
    if (value > bestValue) {
      best = index;
      bestValue = value;
    }
  }
  return best;
}

function columnPeak(player: Player, index: number) {
  let peak: number | null = null;
  for (const slotIndex of columnSlots(index % COLS)) {
    const slot = player.grid[slotIndex];
    if (!slot?.faceUp) continue;
    if (peak === null || slot.value > peak) peak = slot.value;
  }
  return peak;
}

function worstHidden(player: Player) {
  const used = new Set<number>();
  player.grid.forEach((slot, index) => {
    if (slot?.faceUp) used.add(index % COLS);
  });
  const hidden = hiddenIndexes(player);
  const fresh = hidden.filter((index) => !used.has(index % COLS));
  const pool = fresh.length > 0 ? fresh : hidden;
  return pool.reduce<number | null>((best, index) => {
    if (best === null) return index;
    const value = player.grid[index]?.value ?? 0;
    const bestValue = player.grid[best]?.value ?? 0;
    return value > bestValue ? index : best;
  }, null);
}

function knownDump(player: Player, incoming: number) {
  let bestIndex: number | null = null;
  let bestValue = incoming;
  for (const index of hiddenIndexes(player)) {
    const slot = player.grid[index];
    if (!slot || slot.value <= bestValue || keepsColumn(player, index))
      continue;
    bestIndex = index;
    bestValue = slot.value;
  }
  return bestIndex;
}

function keepsColumn(player: Player, index: number) {
  const slot = player.grid[index];
  if (!slot || slot.value <= 0) return false;
  const same = columnSlots(index % COLS).filter((slotIndex) => {
    const other = player.grid[slotIndex];
    return other?.value === slot.value;
  });
  return same.length >= 2;
}

function columnSetup(player: Player, incoming: number) {
  if (incoming <= 0) return null;
  let best: { index: number; saved: number } | null = null;
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const matches = indexes.filter(
      (index) => player.grid[index]?.value === incoming
    );
    if (matches.length < 2) continue;
    const odd = indexes.find((index) => {
      const slot = player.grid[index];
      return slot && slot.value !== incoming;
    });
    if (odd === undefined) continue;
    const oddSlot = player.grid[odd];
    const saved =
      incoming * 2 +
      (oddSlot?.faceUp ? Math.max(0, oddSlot.value - incoming) : 0);
    if (!best || saved > best.saved) best = { index: odd, saved };
  }
  return best;
}

function revealColumn(player: Player) {
  let bestIndex: number | null = null;
  let bestRank = -1;
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const slots = indexes.map((index) => player.grid[index]);
    if (slots.some((slot) => !slot)) continue;
    const value = slots[0]?.value ?? 0;
    if (value <= 0 || !slots.every((slot) => slot?.value === value)) continue;
    const hidden = indexes.filter((index) => {
      const slot = player.grid[index];
      return slot && !slot.faceUp;
    });
    if (hidden.length === 0) continue;
    const revealed = indexes.length - hidden.length;
    if (revealed === 0 && value < 6) continue;
    const rank = revealed * 100 + value;
    if (rank > bestRank) {
      bestRank = rank;
      bestIndex = hidden[0] ?? null;
    }
  }
  return bestIndex;
}

function negativeColumn(player: Player) {
  const banned = new Set<number>();
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const slots = indexes.map((index) => player.grid[index]);
    if (slots.some((slot) => !slot)) continue;
    const value = slots[0]?.value ?? 0;
    if (value > 0 || !slots.every((slot) => slot?.value === value)) continue;
    for (const index of indexes) {
      const slot = player.grid[index];
      if (slot && !slot.faceUp) banned.add(index);
    }
  }
  return banned;
}

function spreadHidden(player: Player) {
  const used = new Set<number>();
  player.grid.forEach((slot, index) => {
    if (slot?.faceUp) used.add(index % COLS);
  });
  const hidden = hiddenIndexes(player);
  return hidden.find((index) => !used.has(index % COLS)) ?? hidden[0] ?? null;
}

function unseenStats(room: Room) {
  const counts = new Map<number, number>();
  for (const [value, count] of DISTRIBUTION) counts.set(value, count);
  const consume = (value: number) => {
    const left = counts.get(value) ?? 0;
    if (left > 0) counts.set(value, left - 1);
  };
  for (const card of room.discard) consume(card.value);
  if (room.phase.kind === "hold") consume(room.phase.card.value);
  for (const player of room.players) {
    for (const slot of player.grid) {
      if (slot?.faceUp) consume(slot.value);
    }
  }
  let sum = 0;
  let total = 0;
  for (const [value, count] of counts) {
    sum += value * count;
    total += count;
  }
  return {
    average: total > 0 ? sum / total : 5,
    count: (value: number) => counts.get(value) ?? 0,
    counts,
  };
}

function sumFaceUp(player: Player) {
  return player.grid.reduce(
    (total, slot) => total + (slot?.faceUp ? slot.value : 0),
    0
  );
}

function wantsDiscardEasy(room: Room, player: Player) {
  const top = room.discard.at(-1)?.value;
  if (top === undefined) return false;
  if (!canDraw(room)) return true;
  if (completionIndex(player, top) !== null && top > 0) return true;
  return (
    bestReplacementEasy(player, top) !== null ||
    (top <= 1 && hiddenIndexes(player).length > 0)
  );
}

function bestSwapEasy(player: Player, incoming: number) {
  if (incoming > 0) {
    const complete = completionIndex(player, incoming);
    if (complete !== null) return complete;
  }
  const replacement = bestReplacementEasy(player, incoming);
  if (replacement !== null) return replacement;
  const hidden = hiddenIndexes(player);
  if (incoming <= 1 && hidden.length > 0) return hidden[0] ?? null;
  if (hidden.length === 1 && !shouldCloseEasy(player, incoming)) {
    return highestFaceUp(player);
  }
  if (incoming <= 3 && hidden.length > 0) return hidden[0] ?? null;
  return null;
}

function shouldCloseEasy(player: Player, incoming: number) {
  return sumFaceUp(player) + incoming <= 8;
}

function bestFlipEasy(player: Player, rng: () => number) {
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

function bestReplacementEasy(player: Player, incoming: number) {
  let bestIndex: number | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < player.grid.length; index += 1) {
    const slot = player.grid[index];
    if (
      !slot?.faceUp ||
      slot.value <= incoming ||
      protectedPairEasy(player, index)
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

function protectedPairEasy(player: Player, index: number) {
  const slot = player.grid[index];
  if (!slot?.faceUp || slot.value > 5) return false;
  const slots = columnSlots(index % COLS).map(
    (slotIndex) => player.grid[slotIndex]
  );
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

function firstHidden(player: Player) {
  const index = player.grid.findIndex((slot) => slot && !slot.faceUp);
  return index === -1 ? null : index;
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
