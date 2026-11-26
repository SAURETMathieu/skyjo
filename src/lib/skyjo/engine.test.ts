import assert from "node:assert/strict";

import { stepBot, suggest } from "./bots.ts";
import { DISTRIBUTION, GRID_SIZE } from "./cards.ts";
import {
  applyAction,
  canDraw,
  createRoom,
  joinRoom,
  pickStarter,
  project,
} from "./engine.ts";
import type { Card, Player, Room, Slot } from "./types.ts";

const host = "host";

function card(id: string, value: number): Card {
  return { id, value };
}

function up(id: string, value: number): Slot {
  return { id, value, faceUp: true };
}

function down(id: string, value: number): Slot {
  return { id, value, faceUp: false };
}

function player(id: string, grid: Slot[], extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    isBot: false,
    total: 0,
    grid,
    ...extra,
  };
}

function room(partial: Partial<Room> & Pick<Room, "players" | "phase">): Room {
  return {
    code: "TEST",
    hostId: host,
    revision: 1,
    seq: 100,
    deck: [],
    discard: [],
    current: 0,
    round: 1,
    closerId: null,
    pending: [],
    lastRound: false,
    summary: null,
    lastEvent: "",
    feed: [],
    ...partial,
  };
}

function zeros(count: number, faceUp = true): Slot[] {
  return Array.from({ length: count }, (_, index) =>
    faceUp ? up(`z${index}`, 0) : down(`z${index}`, 0)
  );
}

const failures: string[] = [];

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`ok ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`fail ${name}`);
    console.error(error);
  }
}

test("le paquet contient 150 cartes avec la bonne répartition", () => {
  let state = createRoom({ code: "ABCD", hostId: host, hostName: "Sam" });
  state = applyAction(state, host, { type: "add-bot" }).state;
  state.players[0]!.isBot = true;
  const started = applyAction(state, host, { type: "start" }, () => 0.1);
  assert.equal(started.ok, true);
  const cards = [
    ...started.state.deck,
    ...started.state.discard,
    ...started.state.players.flatMap((entry) =>
      entry.grid.flatMap((slot) => (slot ? [slot] : []))
    ),
  ];
  assert.equal(cards.length, 150);
  for (const [value, count] of DISTRIBUTION) {
    assert.equal(cards.filter((entry) => entry.value === value).length, count);
  }
  assert.equal(started.state.deck.length, 150 - GRID_SIZE * 2 - 1);
  assert.equal(started.state.phase.kind, "opening");
});

test("le premier joueur est la plus forte somme visible", () => {
  const players = [
    player("a", [up("a1", 12), up("a2", -2), ...zeros(10)]),
    player("b", [up("b1", 4), up("b2", 2), ...zeros(10)]),
  ];
  assert.equal(pickStarter(players), 0);
  assert.equal(sumVisible(players[0]!), 10);
  assert.equal(sumVisible(players[1]!), 6);
});

test("une colonne identique part sur la défausse après la carte échangée", () => {
  const grid: Slot[] = [
    up("a", 5),
    up("b", 1),
    up("c", 2),
    up("d", 3),
    up("e", 5),
    up("f", 4),
    up("g", 6),
    up("h", 7),
    down("i", 9),
    up("j", 8),
    up("k", 10),
    up("l", 11),
  ];
  const state = room({
    players: [player(host, grid)],
    phase: { kind: "choose" },
    discard: [card("d", 5)],
    current: 0,
  });
  const taken = applyAction(state, host, { type: "take-discard" });
  assert.equal(taken.ok, true);
  assert.equal(taken.state.phase.kind, "hold");
  const refused = applyAction(taken.state, host, { type: "discard-drawn" });
  assert.equal(refused.ok, false);
  const swapped = applyAction(taken.state, host, { type: "swap", index: 8 });
  assert.equal(swapped.ok, true);
  assert.deepEqual(
    swapped.state.discard.map((entry) => entry.value),
    [9, 5, 5, 5]
  );
  assert.equal(swapped.state.players[0]?.grid[0], null);
  assert.equal(swapped.state.players[0]?.grid[4], null);
  assert.equal(swapped.state.players[0]?.grid[8], null);
});

test("on peut encore piocher après avoir pris la défausse", () => {
  const state = room({
    players: [player(host, zeros(12))],
    phase: { kind: "choose" },
    discard: [card("d", 8)],
    deck: [card("p", 3), card("q", 1)],
    current: 0,
  });
  const taken = applyAction(state, host, { type: "take-discard" });
  assert.equal(taken.ok, true);
  assert.equal(project(taken.state, host).actions.draw, true);
  const drawn = applyAction(taken.state, host, { type: "draw" });
  assert.equal(drawn.ok, true);
  assert.equal(drawn.state.phase.kind, "hold");
  if (drawn.state.phase.kind !== "hold") return;
  assert.equal(drawn.state.phase.fromDeck, true);
  assert.equal(drawn.state.phase.card.value, 1);
  assert.deepEqual(
    drawn.state.discard.map((entry) => entry.value),
    [8]
  );
  assert.equal(project(drawn.state, host).actions.draw, false);
});

test("une ligne identique reste en jeu", () => {
  const grid = zeros(12, false);
  grid[0] = up("r0", 4);
  grid[1] = up("r1", 4);
  grid[2] = up("r2", 4);
  grid[3] = up("r3", 1);
  grid[5] = down("h", 8);
  const state = room({
    players: [player(host, grid), player("b", zeros(12))],
    phase: { kind: "flip" },
    current: 0,
    discard: [card("d", 1)],
  });
  const flipped = applyAction(state, host, { type: "flip", index: 5 });
  assert.equal(flipped.ok, true);
  assert.equal(flipped.state.players[0]?.grid[0]?.value, 4);
  assert.equal(flipped.state.players[0]?.grid[1]?.value, 4);
  assert.equal(flipped.state.players[0]?.grid[2]?.value, 4);
});

test("la pioche se reconstitue sans perdre la défausse visible", () => {
  const state = room({
    players: [player(host, zeros(12))],
    phase: { kind: "choose" },
    deck: [],
    discard: [card("a", 1), card("b", 2), card("c", 3)],
  });
  assert.equal(canDraw(state), true);
  const drawn = applyAction(state, host, { type: "draw" }, () => 0);
  assert.equal(drawn.ok, true);
  assert.equal(drawn.state.phase.kind, "hold");
  if (drawn.state.phase.kind !== "hold") return;
  assert.equal(drawn.state.discard.length, 1);
  assert.equal(drawn.state.deck.length, 1);
  assert.equal(drawn.state.deck.length + drawn.state.discard.length + 1, 3);
  const empty = room({
    ...state,
    discard: [card("only", 4)],
  });
  assert.equal(applyAction(empty, host, { type: "draw" }).ok, false);
});

test("les cartes cachées des autres restent masquées", () => {
  const grid = zeros(12, false);
  grid[0] = up("v", 3);
  const state = room({
    players: [player(host, zeros(12)), player("b", grid)],
    phase: { kind: "choose" },
    current: 0,
  });
  const view = project(state, host);
  const opponent = view.players[1]?.grid[1];
  assert.equal(opponent?.faceUp, false);
  assert.equal(opponent?.value, null);
  assert.equal(view.players[1]?.grid[0]?.value, 3);
});

test("le score doublé ne s'applique qu'à un score positif qui n'est pas le plus bas", () => {
  const finisher = player(host, scoreGrid(10));
  const other = player("b", scoreGrid(10));
  const state = room({
    players: [finisher, other],
    phase: { kind: "flip" },
    current: 1,
    closerId: host,
    lastRound: true,
    pending: ["b"],
  });
  other.grid[11] = down("last", 0);
  const ended = applyAction(state, "b", { type: "flip", index: 11 });
  assert.equal(ended.state.phase.kind, "between");
  assert.equal(ended.state.summary?.[0]?.doubled, true);
  assert.equal(ended.state.summary?.[0]?.points, 20);
  assert.equal(ended.state.summary?.[1]?.points, 10);

  const lowest = applyAction(
    room({
      players: [player(host, scoreGrid(4)), player("b", scoreGrid(9))],
      phase: { kind: "flip" },
      current: 1,
      closerId: host,
      lastRound: true,
      pending: ["b"],
    }),
    "b",
    { type: "flip", index: 11 }
  );
  assert.equal(lowest.state.summary?.[0]?.doubled, false);
  assert.equal(lowest.state.summary?.[0]?.points, 4);

  const negative = applyAction(
    room({
      players: [player(host, scoreGrid(-2)), player("b", scoreGrid(-2))],
      phase: { kind: "flip" },
      current: 1,
      closerId: host,
      lastRound: true,
      pending: ["b"],
    }),
    "b",
    { type: "flip", index: 11 }
  );
  assert.equal(negative.state.summary?.[0]?.doubled, false);
  assert.equal(negative.state.summary?.[0]?.points, -2);
});

test("une colonne révélée au décompte ne compte pas", () => {
  const grid = zeros(12);
  grid[0] = down("a", 7);
  grid[4] = down("b", 7);
  grid[8] = down("c", 7);
  const state = room({
    players: [player(host, grid), player("b", scoreGrid(3))],
    phase: { kind: "flip" },
    current: 0,
    closerId: "b",
    lastRound: true,
    pending: [host],
  });
  const ended = applyAction(state, host, { type: "flip", index: 0 });
  assert.equal(ended.state.summary?.[0]?.raw, 0);
  assert.equal(ended.state.players[0]?.grid[0], null);
});

test("la partie s'arrête à 100 et le plus petit score gagne", () => {
  const rich = player(host, scoreGrid(15), { total: 90 });
  const poor = player("b", scoreGrid(1), { total: 20 });
  const ended = applyAction(
    room({
      players: [rich, poor],
      phase: { kind: "flip" },
      current: 1,
      closerId: host,
      lastRound: true,
      pending: ["b"],
    }),
    "b",
    { type: "flip", index: 11 }
  );
  assert.equal(ended.state.phase.kind, "over");
  assert.deepEqual(project(ended.state, host).winners, ["b"]);
});

test("celui qui a fini la manche commence la suivante", () => {
  let state = createRoom({ code: "NEXT", hostId: host, hostName: "Sam" });
  const joined = joinRoom(state, "bot-2", "Léo");
  state = joined.state;
  state.players.forEach((entry) => {
    entry.isBot = true;
  });
  state.round = 1;
  state.phase = { kind: "between" };
  state.closerId = "bot-2";
  const next = applyAction(state, host, { type: "next-round" }, () => 0.2);
  assert.equal(next.state.round, 2);
  let playing = next.state;
  for (let step = 0; step < 8 && playing.phase.kind === "opening"; step += 1) {
    playing = stepBot(playing, () => 0.2);
  }
  assert.equal(playing.phase.kind, "choose");
  assert.equal(playing.players[playing.current]?.id, "bot-2");
});

test("un bot prend une petite défausse pour couvrir une grosse carte", () => {
  const grid = zeros(12);
  grid[0] = up("high", 12);
  const state = room({
    players: [player("bot", grid, { isBot: true, name: "Léo" })],
    phase: { kind: "choose" },
    discard: [card("d", -2)],
    current: 0,
  });
  assert.deepEqual(suggest(state), {
    playerId: "bot",
    action: { type: "take-discard" },
  });
});

test("ce n'est pas le tour de l'autre joueur", () => {
  const state = room({
    players: [player(host, zeros(12)), player("b", zeros(12))],
    phase: { kind: "choose" },
    discard: [card("d", 1)],
    deck: [card("p", 2)],
    current: 0,
  });
  assert.equal(applyAction(state, "b", { type: "draw" }).ok, false);
});

function scoreGrid(total: number): Slot[] {
  const grid = zeros(12);
  grid[0] = up("score", total);
  grid[11] = down("flip", 0);
  return grid;
}

function sumVisible(entry: Player) {
  return entry.grid.reduce(
    (sum, slot) => sum + (slot?.faceUp ? slot.value : 0),
    0
  );
}

if (failures.length > 0) {
  process.exit(1);
}
