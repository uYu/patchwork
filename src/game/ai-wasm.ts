import createModule from "./wasm/patchwork.mjs";
import type { Module } from "./wasm/patchwork.mjs";
import { decodeResult, encode } from "./ai-codec.ts";
import type { AIResult, Difficulty, State } from "./types.ts";
export { encode, decodeAction } from "./ai-codec.ts";
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
  const start = m._pw_output() / 4;
  const count = m.HEAP32[start + 9];
  return decodeResult(m.HEAP32.slice(start, start + 10 + count * 7), difficulty, "wasm");
}
