import assert from "node:assert/strict";

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`fail ${name}`);
    throw error;
  }
}

import { opponentMotion } from "./opponent-motion.ts";
import type { GameView, ViewCell, ViewPlayer } from "./types.ts";

function cell(value: number | null, faceUp = false): ViewCell {
  if (value === null) return { empty: true, faceUp: false, value: null };
  return { empty: false, faceUp, value: faceUp ? value : null };
}

function player(id: string, grid: ViewCell[], you = false): ViewPlayer {
  return {
    id,
    name: id,
    isBot: !you,
    isYou: you,
    connected: true,
    left: false,
    total: 0,
    current: !you,
    grid,
    visible: 0,
    hidden: 0,
  };
}

function view(patch: Partial<GameView>): GameView {
  return {
    code: "TEST",
    revision: 1,
    youId: "me",
    hostId: "me",
    youAreHost: true,
    round: 1,
    phase: "choose",
    yourTurn: false,
    lastRound: false,
    deckCount: 20,
    discardTop: 4,
    hand: null,
    opponentHolding: false,
    opponentHand: null,
    holdFromDeck: false,
    currentPlayerId: "bot",
    closerId: null,
    lastEvent: "",
    hint: "",
    players: [],
    summary: null,
    uncovered: [],
    exchange: null,
    winners: [],
    flipsNeeded: 0,
    actions: {
      flip: false,
      draw: false,
      takeDiscard: false,
      swap: false,
      discardDrawn: false,
      nextRound: false,
      start: false,
      addBot: false,
    },
    ...patch,
  };
}

const hidden = cell(1, false);
const shown = (value: number) => cell(value, true);

test("une pioche adverse se voit", () => {
  const grid = [hidden, hidden];
  const motion = opponentMotion(
    view({
      revision: 1,
      players: [player("me", grid, true), player("bot", grid)],
    }),
    view({
      revision: 2,
      phase: "hold",
      opponentHolding: true,
      holdFromDeck: true,
      deckCount: 19,
      players: [player("me", grid, true), player("bot", grid)],
    })
  );
  assert.equal(motion?.kind, "draw");
});

test("une défausse adverse se voit", () => {
  const grid = [hidden, hidden];
  const motion = opponentMotion(
    view({
      revision: 2,
      phase: "hold",
      opponentHolding: true,
      holdFromDeck: true,
      players: [player("me", grid, true), player("bot", grid)],
    }),
    view({
      revision: 3,
      phase: "flip",
      discardTop: 8,
      players: [player("me", grid, true), player("bot", grid)],
    })
  );
  assert.deepEqual(motion, { kind: "discard", value: 8, pile: 4 });
});

test("un échange de carte cachée part vers la défausse", () => {
  const before = [hidden, shown(3)];
  const after = [shown(6), shown(3)];
  const motion = opponentMotion(
    view({
      revision: 4,
      phase: "hold",
      opponentHolding: true,
      holdFromDeck: true,
      players: [player("me", before, true), player("bot", before)],
    }),
    view({
      revision: 5,
      discardTop: 11,
      exchange: { playerId: "bot", index: 0, value: 11, hidden: true },
      players: [player("me", after, true), player("bot", after)],
    })
  );
  assert.equal(motion?.kind, "swap");
  if (motion?.kind !== "swap") return;
  assert.equal(motion.incoming, 6);
  assert.equal(motion.outgoing, 11);
  assert.equal(motion.hidden, true);
  assert.equal(motion.held, true);
  assert.equal(motion.index, 0);
});

test("un simple retournement n'est pas un échange", () => {
  const before = [hidden, hidden];
  const after = [shown(2), hidden];
  const motion = opponentMotion(
    view({
      revision: 1,
      phase: "opening",
      players: [player("me", before, true), player("bot", before)],
    }),
    view({
      revision: 2,
      phase: "opening",
      players: [player("me", after, true), player("bot", after)],
    })
  );
  assert.equal(motion, null);
});
