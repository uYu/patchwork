import test from "node:test";
import assert from "node:assert/strict";
import { chooseEasy, touchesExisting } from "../src/game/ai.ts";
import { decodeAction, encode, wasmModule } from "../src/game/ai-wasm.ts";
import { isLegal, legalActions, newGame } from "../src/game/engine.ts";

test("AI placements attach to existing cloth without changing game legality", async () => {
  const s = newGame(55);
  s.players[0].buttons = 100;
  assert(legalActions(s).every((a) => touchesExisting(s, a)));
  s.players[0].board[0] = 0;
  s.pending = 1;
  assert.equal(legalActions(s).length, 80);
  assert.equal(legalActions(s).filter((a) => touchesExisting(s, a)).length, 2);
  assert(touchesExisting(s, chooseEasy(s, 1)));
  s.pending = 0;
  assert(legalActions(s).some((a) => !touchesExisting(s, a)));
  assert(touchesExisting(s, chooseEasy(s, 2)));

  const m = await wasmModule();
  m.HEAP32.set(encode(s), m._pw_input() / 4);
  assert.equal(m._pw_search(0, 1, 3), 1);
  const out = m._pw_output() / 4;
  assert(touchesExisting(s, decodeAction(m.HEAP32.subarray(out, out + 5))));
  const count = m.HEAP32[out + 9];
  for (let i = 0; i < count; i++) {
    const action = decodeAction(m.HEAP32.subarray(out + 10 + i * 7, out + 15 + i * 7));
    assert(isLegal(s, action));
    assert(touchesExisting(s, action));
  }
});
