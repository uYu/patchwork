import raw from "./patches.json" with { type: "json" };
import type { Cell } from "./types.ts";
export const SIZE = 9;
export const END = 53;
export const INCOME = [5, 11, 17, 23, 29, 35, 41, 47, 53];
// Original physical board, matching the inherited project (before the 2017 revision).
export const LEATHER = [20, 26, 32, 44, 50];
export const COLORS = [
  "#668f8c",
  "#c68b55",
  "#ae6970",
  "#6c7e9c",
  "#9c9b62",
  "#8a7593",
  "#bd9959",
  "#66957c",
];
export const PATCHES = raw.map((p) => ({ ...p, cells: p.cells as Cell[] }));
export function normalize(cells: Cell[]): Cell[] {
  const x = Math.min(...cells.map((c) => c[0])),
    y = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([a, b]) => [a - x, b - y] as Cell)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
export function rotate(cells: Cell[]): Cell[] {
  return normalize(cells.map(([x, y]) => [-y, x]));
}
export function flip(cells: Cell[]): Cell[] {
  return normalize(cells.map(([x, y]) => [-x, y]));
}
export function orientations(cells: Cell[]): Cell[][] {
  const out: Cell[][] = [];
  let shape = normalize(cells);
  for (let i = 0; i < 4; i++, shape = rotate(shape)) {
    for (const s of [shape, flip(shape)])
      if (!out.some((o) => JSON.stringify(o) === JSON.stringify(s)))
        out.push(s);
  }
  return out;
}
export const FORMS = PATCHES.map((p) => orientations(p.cells));
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
