import { INCOME, PATCHES, random } from "./data.ts";
import { actionCells, legalActions } from "./engine.ts";
import type { Action, State } from "./types.ts";
export function touchesExisting(s: State, action: Action): boolean {
  if (action.type === "advance") return true;
  const board = s.players[s.current].board;
  if (board.every((cell) => cell < 0)) return true;
  return actionCells(action).some(([dx, dy]) => {
    const x = action.x + dx, y = action.y + dy;
    return (x > 0 && board[y * 9 + x - 1] >= 0) ||
      (x < 8 && board[y * 9 + x + 1] >= 0) ||
      (y > 0 && board[(y - 1) * 9 + x] >= 0) ||
      (y < 8 && board[(y + 1) * 9 + x] >= 0);
  });
}
export function chooseEasy(s: State, seed: number): Action {
  const actions = legalActions(s).filter((a) => touchesExisting(s, a)),
    p = s.players[s.current],
    rng = random(seed);
  if (!actions.length) throw new Error("无合法行动");
  return actions
    .map((action) => {
      let value = 0;
      if (action.type === "buy") {
        const q = PATCHES[action.piece];
        value =
          (2 * q.cells.length -
            q.cost +
            q.income * INCOME.filter((t) => t > p.time).length) /
          (q.time + 2);
      } else if (action.type === "advance") value = 0.5;
      if (action.type !== "advance")
        for (const [dx, dy] of actionCells(action)) {
          const x = action.x + dx,
            y = action.y + dy;
          for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ])
            if (
              nx < 0 ||
              nx > 8 ||
              ny < 0 ||
              ny > 8 ||
              p.board[ny * 9 + nx] >= 0
            )
              value += 0.08;
        }
      return { action, value: value + rng() * 2 };
    })
    .sort((a, b) => b.value - a.value)[0].action;
}
