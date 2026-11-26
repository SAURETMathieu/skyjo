export const COLS = 4;
export const ROWS = 3;
export const GRID_SIZE = COLS * ROWS;
export const SCORE_LIMIT = 100;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const DISTRIBUTION: ReadonlyArray<readonly [number, number]> = [
  [-2, 5],
  [-1, 10],
  [0, 15],
  [1, 10],
  [2, 10],
  [3, 10],
  [4, 10],
  [5, 10],
  [6, 10],
  [7, 10],
  [8, 10],
  [9, 10],
  [10, 10],
  [11, 10],
  [12, 10],
];

export const CARD_STYLE: Record<number, { background: string; color: string }> =
  {
    [-2]: { background: "#163a86", color: "#f4f7ff" },
    [-1]: { background: "#1d6ed8", color: "#f4f7ff" },
    [0]: { background: "#3ec4d8", color: "#08323c" },
    [1]: { background: "#1c7a3c", color: "#f3fff6" },
    [2]: { background: "#2f9a42", color: "#f3fff6" },
    [3]: { background: "#6fbe3c", color: "#16300c" },
    [4]: { background: "#b6d63c", color: "#1c3008" },
    [5]: { background: "#ffe14a", color: "#3a2e04" },
    [6]: { background: "#f6cc16", color: "#3a2a04" },
    [7]: { background: "#f0be12", color: "#3a2404" },
    [8]: { background: "#e6a80e", color: "#3a1c04" },
    [9]: { background: "#e44532", color: "#fff6f5" },
    [10]: { background: "#d21f26", color: "#fff6f5" },
    [11]: { background: "#b01228", color: "#fff6f5" },
    [12]: { background: "#7c1022", color: "#fff6f5" },
  };

export function columnSlots(column: number) {
  return [column, column + COLS, column + COLS * 2];
}
