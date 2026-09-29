import test from "node:test";
import assert from "node:assert/strict";
import { FORMS } from "../src/game/data.ts";
import { actionCells, isLegal, newGame } from "../src/game/engine.ts";
import { placementAction } from "../src/game/placement.ts";
test("every shape and orientation places an occupied reference square exactly under the pointer", () => {
  FORMS.forEach((forms, piece) =>
    forms.forEach((_, orientation) => {
      for (const cell of [0, 4, 40, 76, 80]) {
        const a = placementAction(cell, piece, orientation);
        assert(a.type === "buy");
        assert(
          actionCells(a).some(
            ([x, y]) =>
              a.x + x === cell % 9 && a.y + y === Math.floor(cell / 9),
          ),
        );
        assert.deepEqual(placementAction(cell, piece, orientation), a);
      }
    }),
  );
});
test("blank top-left corner is compensated without snapping an invalid shape onto the board", () => {
  const piece = FORMS.findIndex((forms) => forms[0][0][0] > 0);
  assert(piece >= 0);
  const a = placementAction(0, piece, 0);
  assert(a.type === "buy");
  assert(a.x < 0);
  const s = newGame(1);
  s.circle = [piece];
  s.token = 0;
  s.players[0].buttons = 100;
  assert.equal(isLegal(s, a), false);
});
