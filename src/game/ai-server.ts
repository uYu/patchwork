import { decodeResult, encode } from "./ai-codec.ts";
import type { AIResult, Difficulty, State } from "./types.ts";

export async function searchServer(
  s: State,
  difficulty: Difficulty,
  seed: number,
  endpoint: string,
): Promise<AIResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: encode(s), difficulty, seed }),
  });
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("values" in payload) || !Array.isArray(payload.values))
    throw new Error("AI 服务返回格式错误");
  return decodeResult(payload.values, difficulty, "native");
}
