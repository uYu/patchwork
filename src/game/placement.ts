import { FORMS } from "./data.ts";
import type { Action } from "./types.ts";
// The pointer attaches to a real square: the leftmost square on the top row.
export function placementAction(
  cell: number,
  piece: number,
  orientation: number,
): Action {
  const [dx, dy] = FORMS[piece][orientation][0];
  return {
    type: "buy",
    piece,
    orientation,
    x: (cell % 9) - dx,
    y: Math.floor(cell / 9) - dy,
  };
}
