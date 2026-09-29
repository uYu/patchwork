import test from "node:test";
import assert from "node:assert/strict";
import { FORMS, INCOME, PATCHES, random } from "../src/game/data.ts";
import {
  applyAction,
  available,
  fits,
  canFitPatch,
  isLegal,
  legalActions,
  newGame,
  score,
  winner,
} from "../src/game/engine.ts";
import { parseSave, replay } from "../src/game/storage.ts";
import type { Action, Save } from "../src/game/types.ts";
test("33 inherited patches, orientations normalized, area preserved and distinct", () => {
  assert.equal(PATCHES.length, 33);
  for (const p of PATCHES) {
    assert(p.cells.length >= 2);
    const seen = new Set();
    for (const c of FORMS[p.id]) {
      assert.equal(c.length, p.cells.length);
      assert.equal(Math.min(...c.map((v) => v[0])), 0);
      assert.equal(Math.min(...c.map((v) => v[1])), 0);
      assert(!seen.has(JSON.stringify(c)));
      seen.add(JSON.stringify(c));
    }
  }
  assert.equal(FORMS[0].length, 2);
  assert.equal(FORMS[8].length, 1);
});
test("seed reproducibility and neutral token begins after domino", () => {
  const s = newGame(123);
  assert.deepEqual(s, newGame(123));
  assert.notDeepEqual(s.circle, newGame(124).circle);
  assert.equal(s.circle[(s.token + s.circle.length - 1) % s.circle.length], 0);
  assert.equal(new Set(s.circle).size, 33);
});
test("reaching equal time retains the active player; buying advances circle past chosen patch", () => {
  const s = newGame(1);
  s.circle = [0, 1, 2, 3];
  s.token = 0;
  s.players[1].time = 1;
  const a: Action = { type: "buy", piece: 0, orientation: 0, x: 0, y: 0 };
  const n = applyAction(s, a);
  assert.equal(n.current, 0);
  assert.equal(n.players[0].time, 1);
  assert.equal(n.players[0].buttons, 3);
  assert.deepEqual(available(n), [1, 2, 3]);
  assert.equal(s.players[0].board[0], -1);
});
test("cannot afford, overlap, wrap rows, buy outside market, malformed coordinates or act after game", () => {
  const s = newGame(1);
  s.circle = [0, 1, 2, 8];
  s.token = 0;
  for (const a of [
    { type: "buy", piece: 8, orientation: 0, x: 0, y: 0 },
    { type: "buy", piece: 0, orientation: 99, x: 0, y: 0 },
    { type: "buy", piece: 0, orientation: 0, x: 8, y: 0 },
    { type: "buy", piece: 0, orientation: 0, x: 0.5, y: 0 },
    { type: "leather", x: 0, y: 0 },
    { type: "fake" },
    null,
  ] as Action[])
    assert.throws(() => applyAction(s, a));
  s.players[0].buttons = 0;
  assert.equal(legalActions(s).length, 1);
  s.players[0].buttons = 5;
  s.players[0].board[0] = 0;
  assert(!isLegal(s, { type: "buy", piece: 0, orientation: 0, x: 0, y: 0 }));
  s.over = true;
  assert.deepEqual(legalActions(s), []);
  assert.throws(() => applyAction(s, { type: "advance" }));
  assert(!fits(Array(81).fill(-1), [[0, 0]], NaN, 0));
});
test("advance counts all crossed incomes and all leather; leather is resolved before switching", () => {
  const s = newGame(1);
  s.players[0].time = 18;
  s.players[0].income = 3;
  s.players[1].time = 45;
  let n = applyAction(s, { type: "advance" });
  assert.equal(n.players[0].time, 46);
  assert.equal(n.players[0].buttons, 5 + 28 + 4 * 3);
  assert.equal(n.pending, 4);
  assert.equal(n.current, 0);
  assert.deepEqual(n.claimed, [true, true, true, true, false]);
  assert(legalActions(n).every((a) => a.type === "leather"));
  for (let i = 0; i < 4; i++)
    n = applyAction(n, { type: "leather", x: i, y: 0 });
  assert.equal(n.pending, 0);
  assert.equal(n.current, 1);
});
test("finish caps advance reward and pays final income, then resolves final leather", () => {
  const s = newGame(1);
  s.players[0].time = 49;
  s.players[0].income = 2;
  s.players[1].time = 53;
  s.firstFinished = 1;
  let n = applyAction(s, { type: "advance" });
  assert.equal(n.players[0].buttons, 11);
  assert.equal(n.pending, 1);
  assert(!n.over);
  n = applyAction(n, { type: "leather", x: 0, y: 0 });
  assert(n.over);
  assert.equal(n.firstFinished, 1);
  assert.equal(INCOME.length, 9);
});
test("full quilt discards leather rather than creating a deadlock", () => {
  const s = newGame(1);
  s.players[0].board.fill(0);
  s.players[0].time = 18;
  s.players[1].time = 45;
  const n = applyAction(s, { type: "advance" });
  assert.equal(n.pending, 0);
  assert.equal(n.current, 1);
});
test("7x7 bonus is unique and can be completed by leather", () => {
  const s = newGame(1);
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) s.players[0].board[y * 9 + x] = 0;
  s.players[0].board[0] = -1;
  s.pending = 1;
  let n = applyAction(s, { type: "leather", x: 0, y: 0 });
  assert.equal(n.bonusOwner, 0);
  assert(n.players[0].bonus);
  n.current = 1;
  n.pending = 1;
  n.players[1].board = [...n.players[0].board];
  n.players[1].board[0] = -1;
  n = applyAction(n, { type: "leather", x: 0, y: 0 });
  assert(!n.players[1].bonus);
});
test("tie winner is the first finisher; score penalizes empty cells", () => {
  const s = newGame(1);
  s.over = true;
  s.firstFinished = 1;
  assert.equal(score(s.players[0]), -157);
  assert.equal(winner(s), 1);
  s.players[0].buttons++;
  assert.equal(winner(s), 0);
});
test("stored history is replayed; tampering rejected without trusting raw state", () => {
  const save: Save = {
    version: 1,
    seed: 12,
    difficulty: "normal",
    mode: "ai",
    actions: [{ type: "advance" }],
  };
  assert.deepEqual(parseSave(JSON.stringify(save)), save);
  assert.deepEqual(parseSave(JSON.stringify({ ...save, mode: "watch" })), { ...save, mode: "watch" });
  assert.equal(replay(save).players[0].time, 1);
  for (const corrupt of [
    { ...save, seed: -1 },
    { ...save, mode: "remote" },
    { ...save, actions: [{ type: "leather", x: 0, y: 0 }] },
    { ...save, actions: [null] },
  ])
    assert.throws(() => parseSave(JSON.stringify(corrupt)));
});
test("100 complete random games terminate and conserve cloth and currency", () => {
  for (let seed = 0; seed < 100; seed++) {
    const rng = random(seed);
    let s = newGame(seed),
      steps = 0;
    while (!s.over) {
      const actions = legalActions(s);
      assert(actions.length);
      const a = actions[Math.floor(rng() * actions.length)];
      s = applyAction(s, a);
      assert(++steps <= 120);
      for (const p of s.players) {
        assert(p.buttons >= 0);
        assert(p.time <= 53);
        assert.equal(p.board.length, 81);
        assert.equal(
          p.income,
          PATCHES.filter((q) => p.board.includes(q.id)).reduce(
            (n, q) => n + q.income,
            0,
          ),
        );
      }
      const bought = PATCHES.filter((p) =>
        s.players.some((q) => q.board.includes(p.id)),
      ).length;
      assert.equal(bought + s.circle.length, 33);
    }
    assert.notEqual(winner(s), null);
  }
});

test("patch fit checks every orientation and rejects fragmented free space", () => {
  for (const patch of PATCHES) {
    assert(canFitPatch(Array(81).fill(-1), patch.id));
    assert(!canFitPatch(Array(81).fill(0), patch.id));
    const shape = FORMS[patch.id].at(-1)!;
    const board = Array(81).fill(0);
    for (const [x,y] of shape) board[y*9+x] = -1;
    assert(canFitPatch(board, patch.id));
    board[shape[0][1]*9+shape[0][0]]=0;
    assert(!canFitPatch(board, patch.id));
  }
});
