import type { Action, AIResult, Difficulty, State } from "./types.ts";

export function encode(s: State): number[] {
  return [
    ...s.players.flatMap((p) => [
      ...p.board,
      p.buttons,
      p.income,
      p.time,
      Number(p.bonus),
    ]),
    s.current,
    s.pending,
    s.claimed.reduce((n, b, i) => n + (b ? 1 << i : 0), 0),
    s.bonusOwner ?? -1,
    s.firstFinished ?? -1,
    Number(s.over),
    s.token,
    s.circle.length,
    ...s.circle,
  ];
}

export function decodeAction(a: ArrayLike<number>): Action {
  return a[0] === 0
    ? { type: "advance" }
    : a[0] === 2
      ? { type: "leather", x: a[3], y: a[4] }
      : { type: "buy", piece: a[1], orientation: a[2], x: a[3], y: a[4] };
}

export function decodeResult(
  values: ArrayLike<number>,
  difficulty: Difficulty,
  backend: "wasm" | "native",
): AIResult {
  const count = values[9];
  if (!Number.isInteger(count) || count < 1 || count > 512 || values.length < 10 + count * 7)
    throw new Error("AI 返回了无效候选");
  const candidates = Array.from({ length: count }, (_, i) => {
    const offset = 10 + i * 7;
    const c = Array.from({ length: 7 }, (_, j) => values[offset + j]);
    return { action: decodeAction(c), visits: c[5], meanValue: c[5] ? c[6] / 10000 : null };
  });
  return {
    candidates,
    action: decodeAction(values),
    modelEvaluations: values[7],
    modelUsed: values[8] === 1,
    ...(difficulty === "hard" ? { strategy: "advanced2" as const } : {}),
    rootCandidates: count,
    simulations: values[5],
    elapsed: values[6],
    backend,
  };
}
