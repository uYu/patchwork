import type { Cell } from "../game/types.ts";
const PALETTE = [
  ["#176278", "#72d5cc", "#f2e1a8"],
  ["#c59129", "#f8e8ac", "#795324"],
  ["#a52844", "#fff0c9", "#dd6877"],
  ["#344785", "#87b3d3", "#d8aabc"],
  ["#27583b", "#b2cc77", "#e8dfa6"],
  ["#6b377b", "#dba876", "#b982bd"],
  ["#d36140", "#f7d998", "#812e44"],
  ["#249ead", "#efe574", "#085677"],
  ["#dfa44d", "#fff0c1", "#c45c43"],
  ["#245769", "#d9d4a4", "#769a94"],
  ["#456c8a", "#e5d6bc", "#96bdc3"],
  ["#853b59", "#c4b387", "#df8190"],
];
export function FabricDefs({
  prefix,
  ids = Array.from({ length: 34 }, (_, i) => i),
}: {
  prefix: string;
  ids?: number[];
}) {
  return (
    <defs>
      {ids.map((id) => {
        const [base, ink, accent] =
          id === 33
            ? ["#a87640", "#d7b079", "#81562d"]
            : PALETTE[id % PALETTE.length];
        return (
          <pattern
            key={id}
            id={`${prefix}-${id}`}
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <rect width="32" height="32" fill={base} />
            {id % 6 === 0 ? (
              <g fill={ink}>
                <path
                  d="M8 3C0 0 0 12 8 12C16 12 16 0 8 3M8 13C1 12 1 22 8 22C15 22 15 12 8 13"
                  transform="rotate(-30 8 12)"
                />
                <path d="M24 19C16 16 16 28 24 28C32 28 32 16 24 19" />
                <path d="M9 7L12 31" stroke={accent} strokeWidth="1.5" />
              </g>
            ) : id % 6 === 1 ? (
              <g fill="none" stroke={ink} strokeWidth="1.5">
                <path d="M-8 8L8 -8L40 24L24 40ZM0 16L16 0L32 16L16 32Z M8 16L16 8L24 16L16 24Z" />
                <path
                  d="M-4 28L4 20M28 4L36 12"
                  stroke={accent}
                  strokeWidth="3"
                />
              </g>
            ) : id % 6 === 2 ? (
              <g fill={ink}>
                <path d="M8 3C1 -2 -2 8 5 10C-2 15 5 22 9 15C15 22 21 15 14 10C21 5 13 -2 8 3Z" />
                <circle cx="9" cy="9" r="2.5" fill={base} />
                <path
                  d="M22 20Q34 7 31 23Q23 28 22 20 M19 32Q11 18 24 25Z"
                  fill={accent}
                />
              </g>
            ) : id % 6 === 3 ? (
              <g fill={ink}>
                <circle cx="6" cy="7" r="3" />
                <circle cx="23" cy="22" r="4" />
                <circle cx="28" cy="4" r="2" fill={accent} />
                <circle cx="7" cy="28" r="2" fill={accent} />
              </g>
            ) : id % 6 === 4 ? (
              <g fill="none" stroke={ink} strokeWidth="1.3">
                <path d="M4 28C-7 8 13 -7 19 8C24 22 5 24 9 10C12 2 19 15 13 15 M27 36C16 16 36 1 42 16" />
                <path
                  d="M6 27Q22 28 23 5"
                  stroke={accent}
                  strokeDasharray="1 2"
                />
              </g>
            ) : (
              <g>
                <path d="M0 0L16 16L0 32ZM32 0L16 16L32 32Z" fill={ink} />
                <path
                  d="M16 0L24 8L16 16L8 8ZM16 16L24 24L16 32L8 24Z"
                  fill={accent}
                />
              </g>
            )}
            <path
              d="M0 2H32M0 6H32M0 10H32M0 14H32M0 18H32M0 22H32M0 26H32M0 30H32"
              stroke="#fff"
              strokeOpacity=".09"
              strokeWidth=".6"
            />
          </pattern>
        );
      })}
    </defs>
  );
}
export function ButtonToken({
  x,
  y,
  r = 9,
}: {
  x: number;
  y: number;
  r?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-24)`}>
      <circle cy="1.5" r={r} fill="#082e39" opacity=".6" />
      <circle r={r} fill="#4ad5e2" stroke="#123f51" strokeWidth="1.5" />
      <circle r={r * 0.74} fill="#82ebed" stroke="#1498ae" strokeWidth="1.5" />
      <path
        d={`M${-r * 0.22} ${-r * 0.27}v${r * 0.54}M${r * 0.22} ${-r * 0.27}v${r * 0.54}`}
        stroke="#13566a"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d={`M${-r * 0.55} ${-r * 0.6}Q0 ${-r * 0.94} ${r * 0.5} ${-r * 0.64}`}
        fill="none"
        stroke="#e5ffff"
        strokeWidth="1.4"
      />
    </g>
  );
}
export function Cloth({
  id,
  cells,
  prefix,
  income = 0,
}: {
  id: number;
  cells: Cell[];
  prefix: string;
  income?: number;
}) {
  const occupied = new Set(cells.map(([x, y]) => `${x},${y}`));
  const edges = cells
    .flatMap(([x, y]) => [
      !occupied.has(`${x},${y - 1}`) ? `M${x * 32} ${y * 32}h32` : "",
      !occupied.has(`${x + 1},${y}`) ? `M${(x + 1) * 32} ${y * 32}v32` : "",
      !occupied.has(`${x},${y + 1}`) ? `M${x * 32} ${(y + 1) * 32}h32` : "",
      !occupied.has(`${x - 1},${y}`) ? `M${x * 32} ${y * 32}v32` : "",
    ])
    .join(" ");
  const buttons = cells.slice(-income);
  return (
    <g>
      {cells.map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          x={x * 32}
          y={y * 32}
          width="32"
          height="32"
          fill={`url(#${prefix}-${id})`}
        />
      ))}
      <path
        d={edges}
        stroke="#291e22"
        strokeOpacity=".55"
        strokeWidth="1.7"
        fill="none"
      />
      <path
        d={edges}
        stroke="#ffecbd"
        strokeOpacity=".8"
        strokeWidth="1"
        strokeDasharray="1 2"
        fill="none"
      />
      {income > 0 &&
        buttons.map(([x, y], i) => (
          <ButtonToken key={i} x={x * 32 + 16} y={y * 32 + 16} />
        ))}
    </g>
  );
}
