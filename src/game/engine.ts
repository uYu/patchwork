import { END, FORMS, INCOME, LEATHER, PATCHES, random } from "./data.ts";
import type { Action, Cell, Player, State } from "./types.ts";
export function newGame(seed: number, firstPlayer: 0 | 1 = 0): State {
  const rng = random(seed),
    circle = PATCHES.map((p) => p.id);
  for (let i = circle.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [circle[i], circle[j]] = [circle[j], circle[i]];
  }
  const player = (): Player => ({
    board: Array(81).fill(-1),
    buttons: 5,
    income: 0,
    time: 0,
    bonus: false,
  });
  return {
    players: [player(), player()],
    circle,
    token: (circle.indexOf(0) + 1) % circle.length,
    current: firstPlayer,
    pending: 0,
    claimed: LEATHER.map(() => false),
    bonusOwner: null,
    firstFinished: null,
    over: false,
  };
}
export function available(s: State): number[] {
  return Array.from(
    { length: Math.min(3, s.circle.length) },
    (_, i) => s.circle[(s.token + i) % s.circle.length],
  );
}
export function score(p: Player) {
  return (
    p.buttons - 2 * p.board.filter((v) => v < 0).length + (p.bonus ? 7 : 0)
  );
}
export function winner(s: State): number | null {
  if (!s.over) return null;
  const d = score(s.players[0]) - score(s.players[1]);
  return d === 0 ? s.firstFinished : d > 0 ? 0 : 1;
}
export function fits(
  board: number[],
  cells: Cell[],
  x: number,
  y: number,
): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    cells.every(
      ([dx, dy]) =>
        x + dx >= 0 &&
        x + dx < 9 &&
        y + dy >= 0 &&
        y + dy < 9 &&
        board[(y + dy) * 9 + x + dx] < 0,
    )
  );
}
export function canFitPatch(board: number[], piece: number): boolean {
  return (FORMS[piece] ?? []).some(cells => {
    const width = Math.max(...cells.map(([x]) => x)) + 1;
    const height = Math.max(...cells.map(([, y]) => y)) + 1;
    for (let y = 0; y <= 9 - height; y++)
      for (let x = 0; x <= 9 - width; x++)
        if (fits(board, cells, x, y)) return true;
    return false;
  });
}
export function actionCells(a: Action): Cell[] {
  return a.type === "leather"
    ? [[0, 0]]
    : a.type === "buy"
      ? (FORMS[a.piece]?.[a.orientation] ?? [])
      : [];
}
export function isLegal(s: State, a: Action): boolean {
  if (!a || s.over) return false;
  if (s.pending > 0)
    return (
      a.type === "leather" &&
      fits(s.players[s.current].board, [[0, 0]], a.x, a.y)
    );
  if (a.type === "advance") return true;
  if (
    a.type !== "buy" ||
    !Number.isInteger(a.piece) ||
    !Number.isInteger(a.orientation)
  )
    return false;
  const p = PATCHES[a.piece],
    cells = FORMS[a.piece]?.[a.orientation];
  return (
    !!p &&
    !!cells &&
    available(s).includes(a.piece) &&
    s.players[s.current].buttons >= p.cost &&
    fits(s.players[s.current].board, cells, a.x, a.y)
  );
}
export function legalActions(s: State): Action[] {
  if (s.over) return [];
  const p = s.players[s.current],
    out: Action[] = [];
  if (s.pending) {
    for (let i = 0; i < 81; i++)
      if (p.board[i] < 0)
        out.push({ type: "leather", x: i % 9, y: Math.floor(i / 9) });
    return out;
  }
  out.push({ type: "advance" });
  for (const piece of available(s))
    if (p.buttons >= PATCHES[piece].cost)
      FORMS[piece].forEach((cells, orientation) => {
        const w = Math.max(...cells.map((c) => c[0])) + 1,
          h = Math.max(...cells.map((c) => c[1])) + 1;
        for (let y = 0; y <= 9 - h; y++)
          for (let x = 0; x <= 9 - w; x++)
            if (fits(p.board, cells, x, y))
              out.push({ type: "buy", piece, orientation, x, y });
      });
  return out;
}
function claimBonus(s: State) {
  if (s.bonusOwner !== null) return;
  const p = s.players[s.current];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      let full = true;
      for (let dy = 0; dy < 7 && full; dy++)
        for (let dx = 0; dx < 7; dx++)
          if (p.board[(y + dy) * 9 + x + dx] < 0) {
            full = false;
            break;
          }
      if (full) {
        p.bonus = true;
        s.bonusOwner = s.current;
        return;
      }
    }
}
export function applyAction(state: State, a: Action): State {
  if (!isLegal(state, a)) throw new Error("不合法的行动");
  const s: State = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      board: [...p.board],
    })) as State["players"],
    circle: [...state.circle],
    claimed: [...state.claimed],
  };
  const p = s.players[s.current],
    old = p.time;
  if (a.type === "leather") {
    p.board[a.y * 9 + a.x] = 33;
    s.pending--;
    claimBonus(s);
  } else {
    if (a.type === "advance") {
      p.time = Math.min(END, s.players[1 - s.current].time + 1);
      p.buttons += p.time - old;
    } else {
      const patch = PATCHES[a.piece];
      p.buttons -= patch.cost;
      p.income += patch.income;
      for (const [dx, dy] of FORMS[a.piece][a.orientation])
        p.board[(a.y + dy) * 9 + a.x + dx] = a.piece;
      const pos = s.circle.indexOf(a.piece);
      s.circle.splice(pos, 1);
      s.token = s.circle.length ? pos % s.circle.length : 0;
      p.time = Math.min(END, old + patch.time);
      claimBonus(s);
    }
    for (const t of INCOME) if (old < t && p.time >= t) p.buttons += p.income;
    LEATHER.forEach((t, i) => {
      if (!s.claimed[i] && old < t && p.time >= t) {
        s.claimed[i] = true;
        s.pending++;
      }
    });
    if (p.time === END && s.firstFinished === null) s.firstFinished = s.current;
  }
  // A full quilt cannot accept leather; discard the excess instead of stalling.
  s.pending = Math.min(s.pending, p.board.filter((v) => v < 0).length);
  if (!s.pending) {
    s.over = s.players.every((p) => p.time === END);
    if (!s.over && p.time > s.players[1 - s.current].time)
      s.current = (1 - s.current) as 0 | 1;
  }
  return s;
}
