import test from "node:test";
import assert from "node:assert/strict";
import { newGame, isLegal } from "../src/game/engine.ts";
import { decodeResult, encode } from "../src/game/ai-codec.ts";
import { search as wasmSearch } from "../src/game/ai-wasm.ts";

test("native AI endpoint returns legal moves and rejects malformed states", async () => {
  process.env.PATCHWORK_TEST_SERVER = "1";
  const { server } = await import("./server.mjs");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    const state = newGame(55);
    const request = { input: encode(state), difficulty: "normal", seed: 22 };
    const invalid = await fetch(`${url}/api/ai/search`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, input: request.input.slice(0, 10) }),
    });
    assert.equal(invalid.status, 400);
    const removed = await fetch(`${url}/api/ai/search`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, difficulty: "experimental" }),
    });
    assert.equal(removed.status, 400);
    for (const difficulty of ["normal", "hard"] as const) {
      const response = await fetch(`${url}/api/ai/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, difficulty }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      const result = decodeResult(payload.values, difficulty, "native");
      assert(isLegal(state, result.action));
      assert(result.candidates?.length);
      if (difficulty === "hard") {
        assert(result.modelEvaluations && result.modelEvaluations > 0);
        assert.equal(result.strategy, "advanced2");
      }
      if (difficulty === "normal") {
        const wasm = await wasmSearch(state, difficulty, 22);
        assert.deepEqual(result.candidates?.map((c) => c.action), wasm.candidates?.map((c) => c.action));
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
