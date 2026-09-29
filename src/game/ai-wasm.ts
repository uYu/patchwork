import createModule from "./wasm/patchwork.mjs";
import type { Module } from "./wasm/patchwork.mjs";
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
let instance: Promise<Module> | undefined;
export async function wasmModule() {
  return (instance ??= createModule());
}
export async function search(
  s: State,
  difficulty: Difficulty,
  seed: number,
): Promise<AIResult> {
  const m = await wasmModule();
  m.HEAP32.set(encode(s), m._pw_input() / 4);
  if (
    !m._pw_search(
      difficulty === "hard" ? 5000 : 0,
      difficulty === "hard" ? -1 : 0,
      seed,
    )
  )
    throw new Error("无合法行动");
  const r = m.HEAP32.slice(m._pw_output() / 4, m._pw_output() / 4 + 10);
  const candidates = Array.from({ length: r[9] }, (_, i) => {
    const offset = m._pw_output() / 4 + 10 + i * 7;
    const c = m.HEAP32.slice(offset, offset + 7);
    return { action: decodeAction(c), visits: c[5], meanValue: c[5] ? c[6] / 10000 : null };
  });
  return {
    candidates,
    action: decodeAction(r),
    modelEvaluations: r[7],
    modelUsed: r[8] === 1,
    ...(difficulty === "hard" ? { strategy: "advanced" as const } : {}),
    rootCandidates: r[9],
    simulations: r[5],
    elapsed: r[6],
    backend: "wasm",
  };
}
