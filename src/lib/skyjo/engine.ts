import {
  COLS,
  columnSlots,
  DISTRIBUTION,
  GRID_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCORE_LIMIT,
} from "@/lib/skyjo/cards";
import type {
  Action,
  BotLevel,
  Card,
  GameView,
  Phase,
  Player,
  Room,
  RoundScore,
  Slot,
  Step,
  ViewCell,
} from "@/lib/skyjo/types";

const BOT_NAMES = ["Léo", "Mia", "Noé", "Zoé", "Alex", "Sam", "Kim"];

export function shuffle<T>(list: T[], rng: () => number): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap] as T;
    copy[swap] = current as T;
  }
  return copy;
}

export function createRoom(input: {
  code: string;
  hostId: string;
  hostName: string;
}): Room {
  return {
    code: input.code,
    hostId: input.hostId,
    revision: 1,
    seq: 1,
    players: [
      {
        id: input.hostId,
        name: cleanName(input.hostName),
        isBot: false,
        total: 0,
        grid: [],
      },
    ],
    deck: [],
    discard: [],
    current: 0,
    phase: { kind: "lobby" },
    round: 0,
    closerId: null,
    pending: [],
    lastRound: false,
    summary: null,
    uncovered: [],
    exchange: null,
    lastEvent: "Partie créée",
    feed: [],
  };
}

export function joinRoom(room: Room, playerId: string, name: string): Step {
  const next = structuredClone(room);
  const existing = next.players.find((player) => player.id === playerId);
  if (existing) {
    if (next.phase.kind === "lobby") existing.name = cleanName(name);
    return commit(next, room, `${existing.name} est de retour`);
  }
  if (next.phase.kind !== "lobby") {
    return fail(room, "La partie a déjà commencé.");
  }
  if (next.players.length >= MAX_PLAYERS) {
    return fail(room, "La table est complète.");
  }
  next.players.push({
    id: playerId,
    name: cleanName(name),
    isBot: false,
    total: 0,
    grid: [],
  });
  return commit(next, room, `${cleanName(name)} rejoint la table`);
}

export function applyAction(
  room: Room,
  playerId: string,
  action: Action,
  rng: () => number = Math.random
): Step {
  const next = structuredClone(room);
  const error = mutate(next, playerId, action, rng);
  if (error) return fail(room, error);
  next.revision += 1;
  return { ok: true, state: next };
}

export function canDraw(room: Room) {
  return room.deck.length > 0 || room.discard.length > 1;
}

export function faceUpCount(player: Player) {
  return player.grid.filter((slot) => slot?.faceUp).length;
}

export function project(room: Room, youId: string): GameView {
  const you = room.players.find((player) => player.id === youId);
  const current = room.players[room.current] ?? null;
  const flipsNeeded =
    room.phase.kind === "opening" && you
      ? Math.max(0, 2 - faceUpCount(you))
      : 0;
  const yourTurn = Boolean(
    (room.phase.kind === "opening" && flipsNeeded > 0) ||
    (current?.id === youId &&
      (room.phase.kind === "choose" ||
        room.phase.kind === "hold" ||
        room.phase.kind === "flip"))
  );
  const reveal = room.phase.kind === "between" || room.phase.kind === "over";
  const youAreHost = room.hostId === youId;
  const holding = room.phase.kind === "hold";
  const minTotal = Math.min(...room.players.map((player) => player.total));

  return {
    code: room.code,
    revision: room.revision,
    youId,
    hostId: room.hostId,
    youAreHost,
    round: room.round,
    phase: room.phase.kind,
    yourTurn,
    lastRound: room.lastRound,
    deckCount: room.deck.length,
    discardTop: room.discard.at(-1)?.value ?? null,
    hand:
      room.phase.kind === "hold" && current?.id === youId
        ? room.phase.card.value
        : null,
    opponentHolding: holding && current?.id !== youId,
    opponentHand:
      room.phase.kind === "hold" &&
      current?.id !== youId &&
      !room.phase.fromDeck
        ? room.phase.card.value
        : null,
    holdFromDeck: room.phase.kind === "hold" && room.phase.fromDeck,
    currentPlayerId: current?.id ?? null,
    closerId: room.closerId,
    lastEvent: room.lastEvent,
    hint: hintFor(room, youId),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      botLevel: player.isBot ? (player.botLevel ?? "normal") : undefined,
      isYou: player.id === youId,
      connected: true,
      left: false,
      total: player.total,
      current: player.id === current?.id && room.phase.kind !== "lobby",
      grid: viewGrid(player.grid, reveal),
      visible: sumFaceUp(player),
      hidden: player.grid.filter((slot) => slot && !slot.faceUp).length,
    })),
    summary: room.summary,
    uncovered: room.uncovered ?? [],
    exchange:
      room.exchange && room.exchange.playerId === youId
        ? {
            index: room.exchange.index,
            value: room.exchange.value,
            hidden: room.exchange.hidden,
          }
        : null,
    winners:
      room.phase.kind === "over"
        ? room.players
            .filter((player) => player.total === minTotal)
            .map((player) => player.id)
        : [],
    flipsNeeded,
    actions: {
      flip:
        (room.phase.kind === "opening" && flipsNeeded > 0) ||
        (room.phase.kind === "flip" && yourTurn),
      draw:
        yourTurn &&
        canDraw(room) &&
        (room.phase.kind === "choose" ||
          (room.phase.kind === "hold" && !room.phase.fromDeck)),
      takeDiscard:
        room.phase.kind === "choose" && yourTurn && room.discard.length > 0,
      swap: room.phase.kind === "hold" && yourTurn,
      discardDrawn:
        room.phase.kind === "hold" && yourTurn && room.phase.fromDeck,
      nextRound: room.phase.kind === "between",
      start:
        room.phase.kind === "lobby" &&
        youAreHost &&
        room.players.length >= MIN_PLAYERS,
      addBot:
        room.phase.kind === "lobby" &&
        youAreHost &&
        room.players.length < MAX_PLAYERS,
    },
  };
}

function mutate(
  room: Room,
  playerId: string,
  action: Action,
  rng: () => number
): string | null {
  room.exchange = null;
  switch (action.type) {
    case "add-bot":
      return addBot(room, playerId, action.level ?? "normal");
    case "remove-bot":
      return removeBot(room, playerId, action.playerId);
    case "start":
      return startRound(room, playerId, rng);
    case "next-round":
      if (room.phase.kind !== "between") return "La manche n'est pas terminée.";
      if (!room.players.some((player) => player.id === playerId)) {
        return "Tu n'es pas dans cette partie.";
      }
      beginRound(room, rng);
      return null;
    case "flip":
      return flipCard(room, playerId, action.index);
    case "draw":
      return drawCard(room, playerId, rng);
    case "take-discard":
      return takeDiscard(room, playerId);
    case "swap":
      return swapCard(room, playerId, action.index);
    case "discard-drawn":
      return discardDrawn(room, playerId);
    default:
      return "Action inconnue.";
  }
}

function addBot(room: Room, playerId: string, level: BotLevel) {
  if (room.phase.kind !== "lobby") return "La partie a déjà commencé.";
  if (playerId !== room.hostId) return "Seul l'hôte peut ajouter un bot.";
  if (room.players.length >= MAX_PLAYERS) return "8 joueurs maximum.";
  const used = new Set(room.players.map((player) => player.name));
  const name =
    BOT_NAMES.find((bot) => !used.has(bot)) ?? `Bot ${room.players.length}`;
  room.players.push({
    id: `bot-${room.seq++}`,
    name,
    isBot: true,
    botLevel: level,
    total: 0,
    grid: [],
  });
  say(room, `${name} s'installe à la table`);
  return null;
}

export function dismissPlayer(
  room: Room,
  playerId: string,
  rng: () => number = Math.random
) {
  const index = room.players.findIndex((player) => player.id === playerId);
  const player = room.players[index];
  if (!player || player.isBot || room.players.length <= 1) return false;
  const wasCurrent = room.players[room.current]?.id === playerId;
  const hidden: Card[] = [];
  const revealed: Card[] = [];
  for (const slot of player.grid) {
    if (!slot) continue;
    const card = { id: slot.id, value: slot.value };
    if (slot.faceUp) revealed.push(card);
    else hidden.push(card);
  }
  if (room.phase.kind === "hold" && wasCurrent) {
    if (room.phase.fromDeck) hidden.push(room.phase.card);
    else room.discard.push(room.phase.card);
    room.phase = { kind: "choose" };
  }
  if (revealed.length > 0) room.discard = [...revealed, ...room.discard];
  if (hidden.length > 0) room.deck = shuffle([...room.deck, ...hidden], rng);

  room.players.splice(index, 1);
  room.pending = room.pending.filter((id) => id !== playerId);
  if (room.summary) {
    room.summary = room.summary.filter((score) => score.playerId !== playerId);
  }

  if (room.players.length < MIN_PLAYERS) {
    room.current = 0;
    room.pending = [];
    room.lastRound = false;
    room.phase = { kind: "over" };
    say(room, `${player.name} est retiré de la partie`);
    room.revision += 1;
    return true;
  }

  if (index < room.current) room.current -= 1;
  if (room.current >= room.players.length) room.current = 0;

  if (
    room.phase.kind === "lobby" ||
    room.phase.kind === "between" ||
    room.phase.kind === "over"
  ) {
    say(room, `${player.name} est retiré de la partie`);
    room.revision += 1;
    return true;
  }

  if (room.phase.kind === "opening") {
    say(room, `${player.name} est retiré de la partie`);
    finishOpening(room);
    room.revision += 1;
    return true;
  }

  if (room.lastRound) {
    if (room.pending.length === 0) {
      say(room, `${player.name} est retiré de la partie`);
      endRound(room);
    } else if (wasCurrent) {
      room.current = indexOf(room, room.pending[0] ?? "");
      room.phase = { kind: "choose" };
      say(room, `${player.name} est retiré de la partie`);
    } else {
      say(room, `${player.name} est retiré de la partie`);
    }
    room.revision += 1;
    return true;
  }

  if (wasCurrent) room.phase = { kind: "choose" };
  say(room, `${player.name} est retiré de la partie`);
  room.revision += 1;
  return true;
}

function removeBot(room: Room, playerId: string, botId: string) {
  if (room.phase.kind !== "lobby") return "La partie a déjà commencé.";
  if (playerId !== room.hostId) return "Seul l'hôte peut retirer un bot.";
  const bot = room.players.find((player) => player.id === botId);
  if (!bot?.isBot) return "Ce joueur ne peut pas être retiré.";
  room.players = room.players.filter((player) => player.id !== botId);
  say(room, `${bot.name} quitte la table`);
  return null;
}

function startRound(room: Room, playerId: string, rng: () => number) {
  if (room.phase.kind !== "lobby") return "La partie a déjà commencé.";
  if (playerId !== room.hostId) return "Seul l'hôte peut lancer la partie.";
  if (room.players.length < MIN_PLAYERS) return "Il faut au moins 2 joueurs.";
  beginRound(room, rng);
  return null;
}

function beginRound(room: Room, rng: () => number) {
  room.round += 1;
  room.deck = shuffle(buildDeck(room), rng);
  room.discard = [];
  room.pending = [];
  room.lastRound = false;
  room.summary = null;
  room.uncovered = [];
  room.exchange = null;
  room.phase = { kind: "opening" };
  const starterId = room.round === 1 ? null : room.closerId;

  for (const player of room.players) {
    player.grid = room.deck.splice(0, GRID_SIZE).map((card) => ({
      ...card,
      faceUp: false,
    }));
  }

  const first = room.deck.pop();
  if (first) room.discard.push(first);

  if (starterId) {
    const index = room.players.findIndex((player) => player.id === starterId);
    room.current = index === -1 ? 0 : index;
  }

  say(room, `Manche ${room.round}`);
  finishOpening(room);
}

function flipCard(room: Room, playerId: string, index: number) {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return "Tu n'es pas dans cette partie.";
  const slot = cell(player, index);
  if (!slot) return "Cette carte n'est pas disponible.";
  if (slot.faceUp) return "Cette carte est déjà visible.";

  if (room.phase.kind === "opening") {
    if (faceUpCount(player) >= 2) return "Tu as déjà retourné 2 cartes.";
    slot.faceUp = true;
    say(room, `${player.name} retourne un ${slot.value}`);
    finishOpening(room);
    return null;
  }

  if (room.phase.kind !== "flip")
    return "Tu ne peux pas retourner de carte maintenant.";
  if (room.players[room.current]?.id !== playerId)
    return "Ce n'est pas ton tour.";
  slot.faceUp = true;
  say(room, `${player.name} retourne un ${slot.value}`);
  clearColumns(room, player);
  finishTurn(room, player);
  return null;
}

function drawCard(room: Room, playerId: string, rng: () => number) {
  if (room.phase.kind === "hold") {
    if (room.phase.fromDeck) return "Tu as déjà pioché.";
    const held = assertTurn(room, playerId, "hold");
    if (held) return held;
    room.discard.push(room.phase.card);
    room.phase = { kind: "choose" };
  }
  const turn = assertTurn(room, playerId, "choose");
  if (turn) return turn;
  if (!canDraw(room)) return "La pioche est vide.";
  if (room.deck.length === 0) {
    const top = room.discard.pop();
    room.deck = shuffle(room.discard, rng);
    room.discard = top ? [top] : [];
  }
  const card = room.deck.pop();
  if (!card) return "La pioche est vide.";
  room.phase = { kind: "hold", card, fromDeck: true };
  say(room, `${room.players[room.current]?.name} pioche`);
  return null;
}

function takeDiscard(room: Room, playerId: string) {
  const turn = assertTurn(room, playerId, "choose");
  if (turn) return turn;
  const card = room.discard.pop();
  if (!card) return "La défausse est vide.";
  room.phase = { kind: "hold", card, fromDeck: false };
  say(room, `${room.players[room.current]?.name} prend un ${card.value}`);
  return null;
}

function discardDrawn(room: Room, playerId: string) {
  if (room.phase.kind !== "hold" || !room.phase.fromDeck) {
    return "Tu dois poser cette carte.";
  }
  const turn = assertTurn(room, playerId, "hold");
  if (turn) return turn;
  room.discard.push(room.phase.card);
  room.phase = { kind: "flip" };
  say(
    room,
    `${room.players[room.current]?.name} défausse un ${room.discard.at(-1)?.value}`
  );
  return null;
}

function swapCard(room: Room, playerId: string, index: number) {
  if (room.phase.kind !== "hold") return "Tu n'as pas de carte en main.";
  const turn = assertTurn(room, playerId, "hold");
  if (turn) return turn;
  const player = room.players[room.current];
  if (!player) return "Joueur introuvable.";
  const previous = cell(player, index);
  if (!previous) return "Cet emplacement est vide.";
  const placed = room.phase.card;
  player.grid[index] = { ...placed, faceUp: true };
  room.discard.push({ id: previous.id, value: previous.value });
  room.exchange = {
    playerId: player.id,
    index,
    value: previous.value,
    hidden: !previous.faceUp,
  };
  say(
    room,
    `${player.name} pose un ${placed.value} à la place d'un ${previous.value}`
  );
  clearColumns(room, player);
  finishTurn(room, player);
  return null;
}

function finishOpening(room: Room) {
  if (room.phase.kind !== "opening") return;
  if (room.players.some((player) => faceUpCount(player) < 2)) return;
  if (room.round === 1) room.current = pickStarter(room.players);
  room.phase = { kind: "choose" };
  const starter = room.players[room.current];
  if (starter) say(room, `${starter.name} commence`);
}

function finishTurn(room: Room, player: Player) {
  if (!room.lastRound && allFaceUp(player)) {
    room.closerId = player.id;
    room.pending = othersAfter(room, player.id);
    room.lastRound = true;
    say(room, `${player.name} termine la manche`);
    if (room.pending.length === 0) {
      endRound(room);
      return;
    }
    room.current = indexOf(room, room.pending[0] ?? player.id);
    room.phase = { kind: "choose" };
    return;
  }

  if (room.lastRound) {
    room.pending = room.pending.filter((id) => id !== player.id);
    if (room.pending.length === 0) {
      endRound(room);
      return;
    }
    room.current = indexOf(room, room.pending[0] ?? player.id);
    room.phase = { kind: "choose" };
    return;
  }

  room.current = (room.current + 1) % room.players.length;
  room.phase = { kind: "choose" };
}

function endRound(room: Room) {
  const uncovered: { playerId: string; index: number; value: number }[] = [];
  for (const player of revealPlayers(room)) {
    player.grid.forEach((slot, index) => {
      if (!slot || slot.faceUp) return;
      uncovered.push({ playerId: player.id, index, value: slot.value });
    });
  }
  room.uncovered = uncovered;
  for (const player of room.players) {
    for (const slot of player.grid) {
      if (slot) slot.faceUp = true;
    }
    clearColumns(room, player);
  }

  const rawScores = room.players.map((player) => ({
    player,
    raw: sumGrid(player),
  }));
  const closerRaw =
    rawScores.find((entry) => entry.player.id === room.closerId)?.raw ?? 0;
  const beaten = rawScores.some(
    (entry) => entry.player.id !== room.closerId && entry.raw <= closerRaw
  );

  const summary: RoundScore[] = rawScores.map(({ player, raw }) => {
    const doubled = player.id === room.closerId && raw > 0 && beaten;
    const points = doubled ? raw * 2 : raw;
    player.total += points;
    return {
      playerId: player.id,
      name: player.name,
      raw,
      points,
      doubled,
      total: player.total,
    };
  });

  room.summary = summary;
  room.lastRound = false;
  room.pending = [];
  const limitReached = room.players.some(
    (player) => player.total >= SCORE_LIMIT
  );
  room.phase = { kind: limitReached ? "over" : "between" };
  const doubled = summary.find((score) => score.doubled);
  say(
    room,
    doubled
      ? `${doubled.name} n'a pas le plus petit score : ${doubled.raw} devient ${doubled.points}`
      : "Scores de la manche"
  );
}

function clearColumns(room: Room, player: Player) {
  for (let column = 0; column < COLS; column += 1) {
    const indexes = columnSlots(column);
    const slots = indexes.map((index) => player.grid[index]);
    if (slots.some((slot) => !slot || !slot.faceUp)) continue;
    const [first] = slots;
    if (!first || !slots.every((slot) => slot && slot.value === first.value)) {
      continue;
    }
    for (const index of indexes) {
      const slot = player.grid[index];
      if (slot) room.discard.push({ id: slot.id, value: slot.value });
      player.grid[index] = null;
    }
    say(room, `${player.name} écarte une colonne de ${first.value}`);
  }
}

function assertTurn(room: Room, playerId: string, kind: Phase["kind"]) {
  if (room.phase.kind !== kind) return "Action impossible pour le moment.";
  if (room.players[room.current]?.id !== playerId)
    return "Ce n'est pas ton tour.";
  return null;
}

function allFaceUp(player: Player) {
  return player.grid.every((slot) => slot === null || slot.faceUp);
}

function sumGrid(player: Player) {
  return player.grid.reduce((total, slot) => total + (slot?.value ?? 0), 0);
}

function sumFaceUp(player: Player) {
  return player.grid.reduce(
    (total, slot) => total + (slot?.faceUp ? slot.value : 0),
    0
  );
}

export function pickStarter(players: Player[]) {
  let best = 0;
  for (let index = 1; index < players.length; index += 1) {
    const score = sumFaceUp(players[index] as Player);
    const bestScore = sumFaceUp(players[best] as Player);
    if (score > bestScore) best = index;
    else if (
      score === bestScore &&
      maxFaceUp(players[index] as Player) > maxFaceUp(players[best] as Player)
    ) {
      best = index;
    }
  }
  return best;
}

function maxFaceUp(player: Player) {
  return player.grid.reduce(
    (max, slot) => (slot?.faceUp ? Math.max(max, slot.value) : max),
    Number.NEGATIVE_INFINITY
  );
}

function revealPlayers(room: Room) {
  const start = room.closerId
    ? room.players.findIndex((player) => player.id === room.closerId)
    : 0;
  const first = start < 0 ? 0 : start;
  const ordered: Player[] = [];
  for (let step = 0; step < room.players.length; step += 1) {
    const player = room.players[(first + step) % room.players.length];
    if (player) ordered.push(player);
  }
  return ordered;
}

function othersAfter(room: Room, playerId: string) {
  const start = indexOf(room, playerId);
  const ids: string[] = [];
  for (let step = 1; step < room.players.length; step += 1) {
    const player = room.players[(start + step) % room.players.length];
    if (player) ids.push(player.id);
  }
  return ids;
}

function indexOf(room: Room, playerId: string) {
  const index = room.players.findIndex((player) => player.id === playerId);
  return index === -1 ? 0 : index;
}

function cell(player: Player, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE) return null;
  return player.grid[index] ?? null;
}

function viewGrid(grid: Slot[], reveal: boolean): ViewCell[] {
  return Array.from({ length: GRID_SIZE }, (_, index) => {
    const slot = grid[index];
    if (!slot) return { empty: true, faceUp: false, value: null };
    const show = slot.faceUp || reveal;
    return { empty: false, faceUp: show, value: show ? slot.value : null };
  });
}

function hintFor(room: Room, youId: string) {
  const you = room.players.find((player) => player.id === youId);
  const current = room.players[room.current];
  if (room.phase.kind === "lobby") {
    return room.players.length < MIN_PLAYERS
      ? "Ajoute un bot ou attends un joueur"
      : "L'hôte peut lancer la partie";
  }
  if (room.phase.kind === "opening") {
    const left = you ? 2 - faceUpCount(you) : 0;
    return left > 0
      ? `Retourne encore ${left} carte${left > 1 ? "s" : ""}`
      : "En attente des autres joueurs";
  }
  if (room.phase.kind === "between") return "Manche terminée";
  if (room.phase.kind === "over")
    return "Partie terminée — le plus petit score gagne";
  const mine = current?.id === youId;
  if (room.phase.kind === "choose") {
    if (mine && room.lastRound)
      return "Dernier tour : pioche ou prends la défausse";
    if (mine) return "Pioche une carte ou prends la défausse";
    return room.lastRound
      ? `Dernier tour de ${current?.name}`
      : `Au tour de ${current?.name}`;
  }
  if (room.phase.kind === "hold") {
    if (!mine) return `${current?.name} regarde une carte…`;
    return room.phase.fromDeck
      ? `Tu as pioché un ${room.phase.card.value}. Pose-la, ou défausse-la.`
      : `Tu as pris un ${room.phase.card.value}. Pose-la, ou pioche si tu changes d'avis.`;
  }
  if (room.phase.kind === "flip") {
    return mine
      ? "Retourne une carte cachée"
      : `${current?.name} retourne une carte…`;
  }
  return "";
}

function buildDeck(room: Room): Card[] {
  const cards: Card[] = [];
  for (const [value, count] of DISTRIBUTION) {
    for (let index = 0; index < count; index += 1) {
      cards.push({ id: `c${room.seq++}`, value });
    }
  }
  return cards;
}

function say(room: Room, message: string) {
  room.lastEvent = message;
  room.feed = [...room.feed, message].slice(-8);
}

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, 18);
  return trimmed || "Joueur";
}

function commit(next: Room, previous: Room, message: string): Step {
  say(next, message);
  next.revision = previous.revision + 1;
  return { ok: true, state: next };
}

function fail(room: Room, error: string): Step {
  return { ok: false, error, state: room };
}
