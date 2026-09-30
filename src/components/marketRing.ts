const perimeter: [number, number][] = [];
for (let x = 1; x <= 12; x++) perimeter.push([x, 1]);
for (let y = 2; y <= 7; y++) perimeter.push([12, y]);
for (let x = 11; x >= 1; x--) perimeter.push([x, 7]);
for (let y = 6; y >= 2; y--) perimeter.push([1, y]);

export function marketRingPosition(rank: number, patchCount: number) {
  const [gridColumn, gridRow] = perimeter[Math.floor(rank * perimeter.length / (patchCount + 1))];
  return { gridColumn, gridRow };
}
