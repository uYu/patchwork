import { chooseEasy } from "./ai.ts";
import { search } from "./ai-wasm.ts";
import type { Difficulty, State } from "./types.ts";
self.onmessage = async (
  e: MessageEvent<{ state: State; difficulty: Difficulty; seed: number }>,
) => {
  const { state, difficulty, seed } = e.data;
  try {
    if (difficulty === "easy")
      self.postMessage({
        action: chooseEasy(state, seed),
        simulations: 0,
        elapsed: 0,
        backend: "typescript",
      });
    else self.postMessage(await search(state, difficulty, seed));
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "AI 加载失败",
    });
  }
};
