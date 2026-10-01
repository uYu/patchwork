import { chooseEasy } from "./ai.ts";
import { searchServer } from "./ai-server.ts";
import type { Difficulty, State } from "./types.ts";
self.onmessage = async (
  e: MessageEvent<{ state: State; difficulty: Difficulty; seed: number; serverUrl?: string }>,
) => {
  const { state, difficulty, seed, serverUrl } = e.data;
  try {
    if (difficulty === "easy")
      self.postMessage({
        action: chooseEasy(state, seed),
        simulations: 0,
        elapsed: 0,
        backend: "typescript",
      });
    else {
      let result;
      try {
        if (!serverUrl) throw new Error("AI 服务未配置");
        result = await searchServer(state, difficulty, seed, serverUrl);
      } catch {
        const { search } = await import("./ai-wasm.ts");
        result = await search(state, difficulty, seed);
      }
      self.postMessage(result);
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "AI 加载失败",
    });
  }
};
