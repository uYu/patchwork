import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeAction,
  encode,
  search,
  wasmModule,
} from "../src/game/ai-wasm.ts";
import {
  applyAction,
  isLegal,
  legalActions,
  newGame,
} from "../src/game/engine.ts";
import { random } from "../src/game/data.ts";
import type { State } from "../src/game/types.ts";
function key(a: unknown) {
  return JSON.stringify(a);
}
function canonical(s: State) {
  const data = encode(s);
  for (let p = 0; p < 2; p++)
    for (let i = 0; i < 81; i++)
      data[p * 85 + i] = data[p * 85 + i] < 0 ? -1 : 0;
  return data;
}
test("C++/Wasm and TS enumerate identical actions and transitions across 30 full games", async () => {
  const m = await wasmModule();
  let checked = 0;
  for (let seed = 0; seed < 30; seed++) {
    const rng = random(seed);
    let s = newGame(seed);
    while (!s.over) {
      const ptr = m._pw_input() / 4;
      m.HEAP32.set(encode(s), ptr);
      const count = m._pw_legal(),
        out = m._pw_output() / 4;
      const cpp = Array.from({ length: count }, (_, i) =>
          decodeAction(m.HEAP32.subarray(out + i * 5, out + i * 5 + 5)),
        ),
        ts = legalActions(s);
      assert.deepEqual(
        cpp.map(key).sort(),
        ts.map(key).sort(),
        `seed ${seed}, step ${checked}`,
      );
      const a = ts[Math.floor(rng() * ts.length)];
      const ok =
        a.type === "advance"
          ? m._pw_step(0, -1, 0, 0, 0)
          : a.type === "leather"
            ? m._pw_step(2, -1, 0, a.x, a.y)
            : m._pw_step(1, a.piece, a.orientation, a.x, a.y);
      assert.equal(ok, 1);
      s = applyAction(s, a);
      const expected = canonical(s);
      assert.deepEqual(
        Array.from(m.HEAP32.subarray(ptr, ptr + expected.length)),
        expected,
      );
      checked++;
    }
  }
  console.log(
    `Cross-engine checks: ${checked} positions, full legal action sets and state transitions`,
  );
});
test("C++ boundary regressions: simultaneous leather, final income, full quilt and bonus", async () => {
  const m = await wasmModule();
  const cases: State[] = [];
  const jump = newGame(1);
  jump.players[0].time = 18;
  jump.players[1].time = 53;
  jump.players[0].income = 3;
  jump.firstFinished = 1;
  cases.push(jump);
  const full = structuredClone(jump);
  full.players[0].board.fill(0);
  cases.push(full);
  const bonus = newGame(1);
  bonus.pending = 1;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) bonus.players[0].board[y * 9 + x] = 0;
  bonus.players[0].board[0] = -1;
  cases.push(bonus);
  for (const s of cases) {
    const ptr = m._pw_input() / 4;
    m.HEAP32.set(encode(s), ptr);
    const a = legalActions(s)[0];
    assert.equal(m._pw_step(a.type === "leather" ? 2 : 0, -1, 0, 0, 0), 1);
    const expected = canonical(applyAction(s, a));
    assert.deepEqual(
      Array.from(m.HEAP32.subarray(ptr, ptr + expected.length)),
      expected,
    );
  }
});
test("normal and advanced AI return legal actions; fixed simulation count is reproducible", async () => {
  const s = newGame(55),
    m = await wasmModule();
  assert(isLegal(s, (await search(s, "normal", 1)).action));
  const result = await search(s, "hard", 1);
  assert(isLegal(s, result.action));
  assert(result.simulations > 0);
  assert(result.elapsed >= 4000 && result.elapsed < 7000);
  assert.equal(result.strategy, "advanced2");
  assert(result.modelEvaluations > 0);
  assert(result.candidates?.some(c => key(c.action) === key(result.action)));
  const results = [];
  for (let i = 0; i < 2; i++) {
    m.HEAP32.set(encode(s), m._pw_input() / 4);
    assert.equal(m._pw_search(0, 32, 123), 1);
    const out = m._pw_output() / 4;
    results.push(Array.from(m.HEAP32.subarray(out, out + 6)));
  }
  assert.deepEqual(results[0], results[1]);
});
