import { INCOME, LEATHER } from "../game/data.ts";
import type { Cell, State } from "../game/types.ts";
import { ButtonToken } from "./Fabric.tsx";
function spiral(): Cell[] {
  const out: Cell[] = [],
    seen = new Set<string>(),
    dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
  let x = 0,
    y = 7,
    d = 0;
  for (let i = 0; i < 54; i++) {
    out.push([30 + x * 52, 30 + y * 52]);
    seen.add(`${x},${y}`);
    let nx = x + dirs[d][0],
      ny = y + dirs[d][1];
    if (nx < 0 || nx > 7 || ny < 0 || ny > 7 || seen.has(`${nx},${ny}`)) {
      d = (d + 1) % 4;
      nx = x + dirs[d][0];
      ny = y + dirs[d][1];
    }
    x = nx;
    y = ny;
  }
  return out;
}
export const TRACK = spiral();
const LINE = TRACK.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
export function TimeBoard({
  state,
  name,
  pawnTimes,
}: {
  state: State;
  name: (i: number) => string;
  pawnTimes?: [number, number];
}) {
  const [endX, endY] = TRACK[53];
  return (
    <section className="time-panel spiral-panel clear-time-board">
      <div className="section-label">
        <h2>时间棋盘</h2>
        <small>沿路径前进 · 后方玩家行动</small>
      </div>
      <svg
        className="spiral-board"
        viewBox="-12 -12 448 448"
        role="img"
        aria-label={`螺旋时间路径，${name(0)}在${state.players[0].time}，${name(1)}在${state.players[1].time}，终点53`}
      >
        <rect x="-10" y="-10" width="444" height="444" rx="15" fill="#233a40" />
        <path
          d={LINE}
          fill="none"
          stroke="#10282e"
          strokeWidth="43"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={LINE}
          fill="none"
          stroke="#a29470"
          strokeWidth="38"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={LINE}
          fill="none"
          stroke="#e5d6ae"
          strokeWidth="33"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {TRACK.slice(1).map(([x, y], j) => {
          const i = j + 1,
            [px, py] = TRACK[j],
            mx = (px + x) / 2,
            my = (py + y) / 2,
            dx = (x - px) / 52,
            dy = (y - py) / 52;
          return (
            <g key={i} data-boundary={i}>
              <path
                d={`M${mx - dy * 17} ${my + dx * 17}L${mx + dy * 17} ${my - dx * 17}`}
                stroke="#8f7b50"
                strokeWidth="1.5"
              />
              {INCOME.includes(i) && (
                <g data-income={i}>
                  <title>越过此线，领取第 {i} 格收入</title>
                  <ButtonToken x={mx} y={my} r={11} />
                </g>
              )}
              {LEATHER.includes(i) && !state.claimed[LEATHER.indexOf(i)] && (
                <g>
                  <title>第 {i} 格皮革</title>
                  <rect
                    x={mx - 8}
                    y={my - 8}
                    width="16"
                    height="16"
                    rx="2"
                    fill="#b5793c"
                    stroke="#fff0b2"
                    strokeWidth="2"
                    strokeDasharray="2 1"
                  />
                </g>
              )}
            </g>
          );
        })}
        {TRACK.map(([x, y], i) => (
          <g key={i} data-time-cell={i}>
            <title>时间 {i}</title>
            <circle
              cx={x}
              cy={y}
              r={i === 53 ? 14 : 13}
              fill={i === 53 ? "#f4c95e" : i === 0 ? "#667d55" : "#f3e8ca"}
              stroke={i === 53 ? "#fff2b2" : "#b9a780"}
              strokeWidth={i === 53 ? 3 : 1}
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize={i === 53 ? 15 : 12}
              fontWeight="700"
              fill={i === 0 ? "#fff" : "#4a4735"}
            >
              {i === 0 ? "起" : i}
            </text>
          </g>
        ))}
        <path
          d={`M${endX + 4} ${endY - 19}v-17h20l-5 6 5 6h-20`}
          stroke="#fff2b2"
          strokeWidth="2"
          fill="#d9a641"
        />
        <path
          d={`M${endX} ${endY + 22}L238 193`}
          stroke="#e9c677"
          strokeDasharray="3 4"
          fill="none"
        />
        <g>
          <rect
            x="177"
            y="196"
            width="126"
            height="67"
            rx="10"
            fill="#132b30"
            stroke="#dcc17b"
          />
          <text
            x="240"
            y="222"
            textAnchor="middle"
            fill="#f4dc97"
            fontSize="19"
            fontWeight="700"
          >
            终点 · 53
          </text>
          <text
            x="240"
            y="245"
            textAnchor="middle"
            fill="#bbcec6"
            fontSize="11"
          >
            到达终点仍领取收入
          </text>
        </g>
        {state.players.map((p, i) => {
          const position = pawnTimes?.[i] ?? p.time;
          const floor = Math.floor(position), fraction = position - floor;
          const start = TRACK[floor], end = TRACK[Math.min(53, floor + 1)];
          const x = start[0] + (end[0] - start[0]) * fraction;
          const y = start[1] + (end[1] - start[1]) * fraction;
          const same = (pawnTimes?.[0] ?? state.players[0].time) === (pawnTimes?.[1] ?? state.players[1].time),
            prev = TRACK[Math.max(0, floor - 1)],
            vertical = position === 0 || prev[0] === x;
          const ox = same && vertical ? (i ? 14 : -14) : 0,
            oy = same && !vertical ? (i ? 14 : -14) : 0;
          return (
            <g
              key={i}
              className={`time-pawn time-pawn-${i}`}
              transform={`translate(${x + ox} ${y + oy})`}
              aria-label={`${name(i)}，${Math.floor(position)}格${state.current === i ? "，当前行动" : ""}`}
            >
              {state.current === i && !state.over && (
                <circle
                  r="20"
                  fill="none"
                  stroke="#fff2a8"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
              )}
              <ellipse cy="4" rx="15" ry="14" fill="#071a21" opacity=".55" />
              <circle
                r="14"
                fill={i === 0 ? "#3c8c50" : "#c34369"}
                stroke="#fff"
                strokeWidth="3"
              />
              <path
                d="M-8-7Q0-13 8-7"
                fill="none"
                stroke="#ffffff80"
                strokeWidth="2"
              />
              <text
                y="5"
                textAnchor="middle"
                fontSize="15"
                fontWeight="800"
                fill="#fff"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="time-player-key">
        {state.players.map((p, i) => (
          <div
            key={i}
            className={state.current === i && !state.over ? "current" : ""}
          >
            <b className={`pawn-badge pawn-badge-${i}`}>{i + 1}</b>
            <span>
              {name(i)}
              <strong>
                {Math.floor(pawnTimes?.[i] ?? p.time)} / 53 格
                {state.current === i && !state.over ? " · 行动中" : ""}
              </strong>
            </span>
          </div>
        ))}
      </div>
      <div className="track-legend">
        蓝纽扣在格子交界线上：越过即领取收入
        <span>
          7 × 7 奖励：
          {state.bonusOwner === null
            ? "待领取"
            : `${name(state.bonusOwner)} +7`}
        </span>
      </div>
    </section>
  );
}
