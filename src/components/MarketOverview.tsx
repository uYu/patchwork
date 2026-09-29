import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { PATCHES, FORMS } from "../game/data.ts";
import type { State } from "../game/types.ts";
import { canFitPatch } from "../game/engine.ts";
import { Patch } from "./Patch.tsx";
function perimeter(total: number, maxCols: number) {
  const cols = Math.min(maxCols, Math.max(4, Math.ceil(total / 2)));
  const rows = Math.max(3, Math.ceil((total - 2 * cols) / 2) + 2);
  const cells: number[][] = [];
  for (let x = 1; x <= cols; x++) cells.push([x, 1]);
  for (let y = 2; y <= rows; y++) cells.push([cols, y]);
  for (let x = cols - 1; x >= 1; x--) cells.push([x, rows]);
  for (let y = rows - 1; y >= 2; y--) cells.push([1, y]);
  return { cols, rows, cells };
}
export function MarketOverview({
  state,
  human,
  piece,
  orientation,
  onSelect,
}: {
  state: State;
  human: boolean;
  piece: number | null;
  orientation: number;
  onSelect: (id: number) => void;
}) {
  const player = state.players[state.current];
  const fits = useMemo(() => PATCHES.map(p => canFitPatch(player.board, p.id)), [player.board]);
  const [inspect, setInspect] = useState<number | null>(null);
  const order = Array.from(
    { length: state.circle.length },
    (_, i) => state.circle[(state.token + i) % state.circle.length],
  );
  useEffect(() => setInspect(null), [state.token, state.circle.length]);
  const focus =
    inspect !== null && order.includes(inspect)
      ? inspect
      : piece !== null && order.includes(piece)
        ? piece
        : order[0];
  const patch = PATCHES[focus],
    rank = order.indexOf(focus),
    buyable = rank >= 0 && rank < 3;
  const affordable =
    !!patch && state.players[state.current].buttons >= patch.cost;
  const desktop = perimeter(order.length + 1, 8),
    mobile = perimeter(order.length + 1, 8);
  const shortRing = desktop.rows <= 5;
  const direction = (cells: number[][], i: number) => {
    const current = cells[i],
      next = cells[(i + 1) % cells.length];
    return `${(Math.atan2(next[1] - current[1], next[0] - current[0]) * 180) / Math.PI}deg`;
  };
  const position = (i: number) =>
    ({
      "--flow-angle": direction(desktop.cells, i),
      "--mobile-flow-angle": direction(mobile.cells, i),
      "--ring-col": desktop.cells[i][0],
      "--ring-row": desktop.cells[i][1],
      "--mobile-col": mobile.cells[i][0],
      "--mobile-row": mobile.cells[i][1],
    }) as CSSProperties;
  const gridStyle = {
    "--ring-cols": desktop.cols,
    "--ring-rows": desktop.rows,
    "--mobile-cols": mobile.cols,
    "--mobile-rows": mobile.rows,
  } as CSSProperties;
  const inspection = patch ? (
    <div className={`market-inspection ${shortRing ? "below-ring" : "ring-center"}`}>
      <Patch
        id={focus}
        showAnchor
        cells={piece === focus ? FORMS[focus][orientation] : undefined}
      />
      <div>
        <strong>
          {String(focus + 1).padStart(2, "0")} 号拼布{" "}
          <small>环上第 {rank + 1} 块</small>
        </strong>
        <span>
          成本 {patch.cost} 纽扣 · 前进 {patch.time} 步 · 收入 +{patch.income}
        </span>
        <p>
          {!fits[focus]
            ? "放不下：所有旋转、翻转都没有合法落点。"
            : !buyable
            ? "后续布料，可查看并规划之后的购买。"
            : !affordable
              ? "在购买范围内，但当前纽扣不足。"
              : piece === focus
                ? "白色定位点对应鼠标格，先预览再点击锁定。"
                : "当前可购买，点击这块拼布选择。"}
        </p>
      </div>
    </div>
  ) : (
    <p className={`market-reading ${shortRing ? "below-ring" : "ring-center"}`}>
      布料已售罄，可前进领取纽扣。
    </p>
  );
  return (
    <div className="market-overview">
      <div className="market-origin">
        <span>
          ♟ 中立标记 <b>→</b>
        </span>
        <strong>全部 {order.length} 块 · 完整一圈</strong>
      </div>
      <p className="market-reading">
        从中立标记出发，沿上边向右、右边向下、下边向左，绕一整圈。绿框三块为当前购买范围。
      </p>
      <div
        className="market-all complete-ring"
        style={gridStyle}
        role="group"
        aria-label={`完整布料市场，共${order.length}块拼布`}
      >
        <div className="ring-rail" aria-hidden="true" />
        <div
          className="ring-marker"
          style={position(0)}
          aria-label="中立标记，顺时针前方三块可购买"
        >
          <b>♟</b>
          <span>中立标记</span>
          <strong>→</strong>
        </div>
        {order.map((id, rank) => {
          const p = PATCHES[id];
          return (
            <button
              key={id}
              style={position(rank + 1)}
              className={`overview-patch ${rank < 3 ? "reachable" : ""} ${piece === id ? "chosen" : ""} ${focus === id ? "inspected" : ""} ${rank >= 3 || p.cost > player.buttons || !fits[id] ? "unavailable" : ""}`}
              onClick={() => {
                setInspect(id);
                if (
                  human &&
                  !state.pending &&
                  rank < 3 &&
                  fits[id] &&
                  state.players[state.current].buttons >= p.cost
                )
                  onSelect(id);
              }}
              aria-label={`第 ${rank + 1} 块，${id + 1} 号拼布，${rank < 3 ? "购买范围内" : "后续拼布"}，花费 ${p.cost} 纽扣，${p.time} 时间，收入 ${p.income}`}
              aria-pressed={focus === id}
            >
              <span className="overview-order">
                <b>{String(rank + 1).padStart(2, "0")}</b>
                <span className={rank < 3 ? undefined : "ring-flow"}>
                  {!fits[id] ? "放不下" : rank < 3 ? p.cost > player.buttons ? "不足" : "可选" : "→"}
                </span>
              </span>
              <Patch id={id} />
              <span className="overview-cost">
                ◎{p.cost}
                <span>◷{p.time}</span>
                <span>+{p.income}</span>
              </span>
            </button>
          );
        })}
        {!shortRing && inspection}
      </div>
      {shortRing && inspection}
    </div>
  );
}
