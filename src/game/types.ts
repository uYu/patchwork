export type Cell = [number, number];
export type Difficulty = "easy" | "normal" | "hard";
export type Mode = "ai" | "local" | "watch";
export type Action =
  | { type: "advance" }
  | { type: "buy"; piece: number; orientation: number; x: number; y: number }
  | { type: "leather"; x: number; y: number };
export interface Player {
  board: number[];
  buttons: number;
  income: number;
  time: number;
  bonus: boolean;
}
export interface State {
  players: [Player, Player];
  circle: number[];
  token: number;
  current: 0 | 1;
  pending: number;
  claimed: boolean[];
  bonusOwner: number | null;
  firstFinished: number | null;
  over: boolean;
}
export interface Save {
  version: 1;
  seed: number;
  firstPlayer?: 0 | 1;
  difficulty: Difficulty;
  mode: Mode;
  actions: Action[];
  analysis?: Record<string, AIResult>;
}
export interface AICandidate {
  action: Action;
  visits: number;
  meanValue: number | null;
}
export interface AIResult {
  candidates?: AICandidate[];
  action: Action;
  modelEvaluations?: number;
  modelUsed?: boolean;
  strategy?: "advanced" | "research" | "research2";
  rootCandidates?: number;
  simulations: number;
  elapsed: number;
  backend: "wasm" | "typescript";
}
