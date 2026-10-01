import test from "node:test";
import assert from "node:assert/strict";
import { history, describeStep } from "../src/game/history.ts";
import { applyAction, newGame, legalActions, score } from "../src/game/engine.ts";
import { parseSave, replay } from "../src/game/storage.ts";
import { search } from "../src/game/ai-wasm.ts";
import type { Save } from "../src/game/types.ts";
test("history derives actual actors, income and unique bonus, including consecutive turns", () => {
  const state = newGame(1);
  state.players[1].time = 20;
  state.players[0].income = 3;
  const action = { type: "advance" } as const;
  const step = describeStep(state, action, applyAction(state, action));
  assert.equal(step.actor, 0);
  assert.equal(step.incomeCount, 3);
  assert.equal(step.earnedIncome, 9);
  assert.equal(step.leather, 1);
  const bonus = newGame(1); bonus.pending = 1;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) bonus.players[0].board[y * 9 + x] = 0;
  bonus.players[0].board[0] = -1;
  const leather = { type: "leather", x: 0, y: 0 } as const;
  assert(describeStep(bonus, leather, applyAction(bonus, leather)).bonus);
  const save: Save = { version: 1, seed: 1, mode: "local", difficulty: "normal", actions: [] };
  let s = newGame(1);
  while (!s.over) { const a = legalActions(s)[0]; save.actions.push(a); s = applyAction(s, a); }
  const entries = history(save);
  assert.deepEqual(entries.at(-1)?.after, replay(save));
  assert.equal(score(entries.at(-1)!.after.players[0]), score(s.players[0]));
  assert(entries.some((e, i) => i > 0 && e.actor === entries[i - 1].actor));
});
test("real search candidates are legal, retain selected action and survive export/import", async () => {
  const state = newGame(55), result = await search(state, "hard", 123);
  const candidates = result.candidates!;
  assert(result.modelUsed);
  assert.equal(candidates.length, result.rootCandidates);
  assert(candidates.some(c => JSON.stringify(c.action) === JSON.stringify(result.action)));
  assert.equal(candidates.reduce((n, c) => n + c.visits, 0), result.simulations);
  const groups = new Map<string, number>();
  for (const c of candidates) {
    assert.doesNotThrow(() => applyAction(state, c.action));
    const key = c.action.type === "buy" ? String(c.action.piece) : c.action.type;
    groups.set(key, (groups.get(key) ?? 0) + 1);
    assert(c.visits === 0 ? c.meanValue === null : Math.abs(c.meanValue!) <= 1);
  }
  assert([...groups.values()].some(n => n >= 8));
  assert([...groups.values()].every(n => n <= 9));
  const save: Save = {version: 1, seed: 55, mode: "ai", difficulty: "hard", actions: [result.action], analysis: {0: result}};
  assert.deepEqual(parseSave(JSON.stringify(save)), save);
  const bad = structuredClone(save); bad.analysis![0].candidates![0].action = {type: "leather", x: 90, y: 90};
  assert.throws(() => parseSave(JSON.stringify(bad)));
  const old = {...save, analysis: undefined};
  assert.equal(parseSave(JSON.stringify(old)).analysis, undefined);
  const legacyResearch = {...old, difficulty: "research"};
  assert.equal(parseSave(JSON.stringify(legacyResearch)).difficulty, "hard");
  const experiment: Save = {
    ...save,
    analysis: {0: {...result, backend: "native", strategy: "experimental"}},
  };
  assert.deepEqual(parseSave(JSON.stringify({...experiment, difficulty: "experimental"})), experiment);
});
