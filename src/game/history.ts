import { INCOME, PATCHES } from "./data.ts";
import { applyAction, newGame } from "./engine.ts";
import type { Action, Save, State } from "./types.ts";
export function actionLabel(a: Action) {
  return a.type === "advance" ? "前进，收取纽扣" : a.type === "leather" ? "缝上皮革补丁" : `缝上 ${String(a.piece + 1).padStart(2, "0")} 号拼布`;
}
export function actionPosition(a: Action) {
  return a.type === "advance" ? "" : `${a.y + 1} 行 ${a.x + 1} 列${a.type === "buy" ? ` · 朝向 ${a.orientation + 1}` : ""}`;
}
export function describeStep(before: State, action: Action, after: State) {
  const actor = before.current, p = before.players[actor], q = after.players[actor];
  const incomeCount = INCOME.filter(t => p.time < t && t <= q.time).length;
  const cost = action.type === "buy" ? PATCHES[action.piece].cost : 0;
  const leather = after.claimed.filter(Boolean).length - before.claimed.filter(Boolean).length;
  return { before, after, action, actor, incomeCount, cost, leather,
    earnedIncome: incomeCount * q.income,
    bonus: before.bonusOwner === null && after.bonusOwner !== null };
}
export function history(save: Save) {
  let before = newGame(save.seed, save.firstPlayer);
  return save.actions.map(action => {
    const after = applyAction(before, action), entry = describeStep(before, action, after);
    before = after;
    return entry;
  });
}
export type HistoryEntry = ReturnType<typeof describeStep>;
