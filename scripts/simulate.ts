import { chooseEasy } from "../src/game/ai.ts";
import { search } from "../src/game/ai-wasm.ts";
import { applyAction, newGame, score, winner } from "../src/game/engine.ts";
import type { Difficulty } from "../src/game/types.ts";
const games = Number(process.argv[2] ?? 10),
  difficulty = (process.argv[3] ?? "normal") as Difficulty;
if (
  !Number.isInteger(games) ||
  games < 1 ||
  games > 10000 ||
  !["easy", "normal", "hard"].includes(difficulty)
)
  throw new Error(
    "Usage: npm run simulate -- <1..10000 games> <easy|normal|hard>",
  );
const wins = [0, 0];
const start = performance.now();
for (let seed = 0; seed < games; seed++) {
  let s = newGame(seed),
    steps = 0;
  while (!s.over) {
    const a =
      s.current === seed % 2 && difficulty !== "easy"
        ? (await search(s, difficulty, seed + steps)).action
        : chooseEasy(s, seed + steps);
    s = applyAction(s, a);
    if (++steps > 120) throw new Error("Game did not finish");
  }
  wins[winner(s)!]++;
  console.log(
    `seed=${seed} steps=${steps} scores=${s.players.map(score)} winner=${winner(s)}`,
  );
}
console.log(
  JSON.stringify({
    games,
    difficulty,
    wins,
    elapsedMs: Math.round(performance.now() - start),
  }),
);
