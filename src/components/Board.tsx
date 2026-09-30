import { useId } from "react";
import { Cloth, FabricDefs } from "./Fabric.tsx";
import type { Cell } from "../game/types.ts";
import { PATCHES } from "../game/data.ts";
import { actionCells, isLegal } from "../game/engine.ts";
import type { Action, Player, State } from "../game/types.ts";
export function Board({
  player,
  state,
  preview,
  previewValid,
  highlight,
  landing,
  pointerCell = null,
  interactive = false,
  onHover,
  onPlace,
  label,
}: {
  player: Player;
  state: State;
  preview?: Action;
  previewValid?: boolean;
  highlight?: Action;
  landing?: Action;
  pointerCell?: number | null;
  interactive?: boolean;
  onHover?: (i: number | null) => void;
  onPlace?: (i: number) => void;
  label: string;
}) {
  const marked = new Set(highlight && highlight.type !== "advance" ? actionCells(highlight).map(([x, y]) => (highlight.y + y) * 9 + highlight.x + x) : []);
  const prefix = `quilt${useId().replace(/:/g, "")}`;
  const groups = new Map<number, Cell[]>();
  player.board.forEach((id, i) => {
    if (id >= 0) {
      const group = groups.get(id) ?? [];
      group.push([i % 9, Math.floor(i / 9)]);
      groups.set(id, group);
    }
  });
  const ghost = new Set<number>();
  if (preview && preview.type !== "advance")
    for (const [dx, dy] of actionCells(preview)) {
      const x = preview.x + dx,
        y = preview.y + dy;
      if (x >= 0 && x < 9 && y >= 0 && y < 9) ghost.add(y * 9 + x);
    }
  const valid = previewValid ?? (preview ? isLegal(state, preview) : false);
  return (
    <>
    <div
      className={`quilt player-color-${state.players.indexOf(player)} ${interactive ? "interactive" : ""}`}
      data-player={state.players.indexOf(player)}
      role="group"
      aria-label={label}
      onMouseLeave={() => onHover?.(null)}
    >
      <svg className="quilt-art" viewBox="0 0 288 288" aria-hidden="true">
        <FabricDefs prefix={prefix} ids={[...groups.keys()]} />
        {[...groups].map(([id, cells]) => (
          <Cloth
            key={id}
            id={id}
            cells={cells}
            prefix={prefix}
            income={PATCHES[id]?.income ?? 0}
          />
        ))}
      </svg>
      {landing && landing.type !== "advance" && <svg className="action-cloth-layer" viewBox="0 0 288 288" aria-hidden="true">
        <FabricDefs prefix={`${prefix}-landing`} ids={[landing.type === "buy" ? landing.piece : 33]} />
        <g className="action-cloth" style={landing.type === "buy" ? { animationDuration: "200ms" } : undefined}><Cloth id={landing.type === "buy" ? landing.piece : 33} prefix={`${prefix}-landing`} cells={actionCells(landing).map(([x,y]) => [landing.x+x,landing.y+y])} income={landing.type === "buy" ? PATCHES[landing.piece].income : 0} /></g>
      </svg>}
      {preview && preview.type !== "advance" && (
        <svg
          className="quilt-preview-art"
          viewBox="0 0 288 288"
          aria-hidden="true"
        >
          <FabricDefs
            prefix={`${prefix}-preview`}
            ids={[preview.type === "buy" ? preview.piece : 33]}
          />
          <g opacity=".75">
            <Cloth
              id={preview.type === "buy" ? preview.piece : 33}
              cells={actionCells(preview).map(([dx, dy]) => [
                preview.x + dx,
                preview.y + dy,
              ])}
              prefix={`${prefix}-preview`}
              income={preview.type === "buy" ? PATCHES[preview.piece].income : 0}
            />
          </g>
          {actionCells(preview).map(([dx,dy],i) => {
            const x=preview.x+dx,y=preview.y+dy;
            return x<0||x>=9||y<0||y>=9 ? <rect key={i} data-outside-preview="true" x={x*32} y={y*32} width="32" height="32" fill="#d9375355" stroke="#ff6b78" strokeWidth="2" strokeDasharray="5 3"/> : null;
          })}
        </svg>
      )}
      {player.board.map((id, i) => {
        const cls = `stitch ${pointerCell === i && preview ? "placement-pin" : ""} ${id >= 0 ? "filled" : ""} ${marked.has(i) ? "move-highlight" : ""} ${ghost.has(i) ? `ghost ${valid ? "valid" : "invalid"}` : ""}`;
        const title = `${Math.floor(i / 9) + 1} 行 ${(i % 9) + 1} 列，${id < 0 ? "空格" : id === 33 ? "皮革" : `拼布 ${id + 1}`}`;
        return interactive ? (
          <button
            type="button"
            key={i}
            className={cls}
            data-cell={i}
            aria-label={`${title}，点击选择落点`}
            title={title}
            onMouseEnter={() => onHover?.(i)}
            onFocus={() => onHover?.(i)}
            onClick={() => onPlace?.(i)}
            onKeyDown={(e) => {
              const delta = (
                {
                  ArrowRight: 1,
                  ArrowLeft: -1,
                  ArrowDown: 9,
                  ArrowUp: -9,
                } as Record<string, number>
              )[e.key];
              if (delta !== undefined) {
                e.preventDefault();
                const target = Math.max(0, Math.min(80, i + delta));
                const next = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`button[data-cell="${target}"]`);
                next?.focus();
              }
            }}
          />
        ) : (
          <span key={i} className={cls} data-cell={i} title={title} />
        );
      })}
    </div>
    </>
  );
}
