import { applyAction, newGame, isLegal } from "./engine.ts";
import type { Save, AIResult } from "./types.ts";
export const MAX_SAVE_BYTES = 2_000_000;
export const SAVE_KEY = "patchwork.save.v1";
export function replay(save: Save, end = save.actions.length) {
  return save.actions.slice(0, end).reduce(applyAction, newGame(save.seed, save.firstPlayer));
}
export function parseSave(text: string): Save {
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES) throw new Error("存档不能超过 2 MB");
  const s = JSON.parse(text);
  if (
    !s ||
    s.version !== 1 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 4294967295 ||
    (s.firstPlayer !== undefined && s.firstPlayer !== 0 && s.firstPlayer !== 1) ||
    !["easy", "normal", "hard", "experimental", "research"].includes(s.difficulty) ||
    !["ai", "local", "watch"].includes(s.mode) ||
    !Array.isArray(s.actions) ||
    s.actions.length > 200
  )
    throw new Error("存档格式或版本无效");
  const save: Save = {
    version: 1,
    seed: s.seed,
    ...(s.firstPlayer !== undefined ? { firstPlayer: s.firstPlayer } : {}),
    difficulty: s.difficulty === "research" || s.difficulty === "experimental" ? "hard" : s.difficulty,
    mode: s.mode,
    actions: s.actions,
  };
  let state = newGame(save.seed, save.firstPlayer);
  const sameAction = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (s.analysis !== undefined && (!s.analysis || typeof s.analysis !== "object" || Array.isArray(s.analysis)))
    throw new Error("AI 复盘记录格式无效");
  const analysis: Record<string, AIResult> = {};
  save.actions.forEach((action, index) => {
    const detail = s.analysis?.[index] as AIResult | undefined;
    if (detail !== undefined) {
      const finite = (n: number) => Number.isFinite(n) && n >= 0;
      if (!detail || !isLegal(state, detail.action) || !sameAction(detail.action, action) ||
          !finite(detail.elapsed) || !Number.isInteger(detail.simulations) || detail.simulations < 0 ||
          !["wasm", "native", "typescript"].includes(detail.backend) ||
          (detail.modelUsed !== undefined && typeof detail.modelUsed !== "boolean") ||
          (detail.strategy !== undefined && !["advanced2", "advanced", "experimental", "research", "research2"].includes(detail.strategy)) ||
          (detail.modelEvaluations !== undefined && !finite(detail.modelEvaluations)) ||
          (detail.candidates !== undefined && (!Array.isArray(detail.candidates) || detail.candidates.length > 32 ||
            detail.candidates.some(c => !c || !isLegal(state, c.action) || !Number.isInteger(c.visits) || c.visits < 0 ||
              (c.meanValue !== null && (!Number.isFinite(c.meanValue) || Math.abs(c.meanValue) > 1))) ||
            new Set(detail.candidates.map(c => JSON.stringify(c.action))).size !== detail.candidates.length ||
            !detail.candidates.some(c => sameAction(c.action, action)))))
        throw new Error(`第 ${index + 1} 步 AI 复盘记录无效`);
      analysis[index] = detail;
    }
    state = applyAction(state, action);
  });
  if (Object.keys(s.analysis ?? {}).some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= save.actions.length))
    throw new Error("AI 复盘步数无效");
  if (Object.keys(analysis).length) save.analysis = analysis;
  return save;
}
export function downloadSave(save: Save) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(save, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `patchwork-${save.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
