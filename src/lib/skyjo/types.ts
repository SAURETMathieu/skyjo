export type Card = {
  id: string;
  value: number;
};

export type Slot = {
  id: string;
  value: number;
  faceUp: boolean;
} | null;

export type BotLevel = "easy" | "normal" | "hard";

export type Player = {
  id: string;
  name: string;
  isBot: boolean;
  botLevel?: BotLevel;
  total: number;
  grid: Slot[];
};

export type Phase =
  | { kind: "lobby" }
  | { kind: "opening" }
  | { kind: "choose" }
  | { kind: "hold"; card: Card; fromDeck: boolean }
  | { kind: "flip" }
  | { kind: "between" }
  | { kind: "over" };

export type RoundScore = {
  playerId: string;
  name: string;
  raw: number;
  points: number;
  doubled: boolean;
  total: number;
};

export type Room = {
  code: string;
  hostId: string;
  revision: number;
  seq: number;
  players: Player[];
  deck: Card[];
  discard: Card[];
  current: number;
  phase: Phase;
  round: number;
  closerId: string | null;
  pending: string[];
  lastRound: boolean;
  summary: RoundScore[] | null;
  lastEvent: string;
  feed: string[];
};

export type Action =
  | { type: "add-bot"; level?: BotLevel }
  | { type: "remove-bot"; playerId: string }
  | { type: "start" }
  | { type: "flip"; index: number }
  | { type: "draw" }
  | { type: "take-discard" }
  | { type: "swap"; index: number }
  | { type: "discard-drawn" }
  | { type: "next-round" };

export type Step = {
  ok: boolean;
  error?: string;
  state: Room;
};

export type ViewCell = {
  empty: boolean;
  faceUp: boolean;
  value: number | null;
};

export type ViewPlayer = {
  id: string;
  name: string;
  isBot: boolean;
  botLevel?: BotLevel;
  isYou: boolean;
  connected: boolean;
  left: boolean;
  total: number;
  current: boolean;
  grid: ViewCell[];
  visible: number;
  hidden: number;
};

export type RoomSnapshot =
  | { member: true; view: GameView }
  | {
      member: false;
      code: string;
      phase: Phase["kind"];
      hostId: string;
      players: { id: string; name: string; isBot: boolean }[];
    };

export type GameView = {
  code: string;
  revision: number;
  youId: string;
  hostId: string;
  youAreHost: boolean;
  round: number;
  phase: Phase["kind"];
  yourTurn: boolean;
  lastRound: boolean;
  deckCount: number;
  discardTop: number | null;
  hand: number | null;
  opponentHolding: boolean;
  opponentHand: number | null;
  holdFromDeck: boolean;
  currentPlayerId: string | null;
  closerId: string | null;
  lastEvent: string;
  hint: string;
  players: ViewPlayer[];
  summary: RoundScore[] | null;
  winners: string[];
  flipsNeeded: number;
  actions: {
    flip: boolean;
    draw: boolean;
    takeDiscard: boolean;
    swap: boolean;
    discardDrawn: boolean;
    nextRound: boolean;
    start: boolean;
    addBot: boolean;
  };
};
