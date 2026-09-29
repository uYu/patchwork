import { useId } from "react";
import { PATCHES } from "../game/data.ts";
import type { Cell } from "../game/types.ts";
import { Cloth, FabricDefs } from "./Fabric.tsx";
export function Patch({
  id,
  cells,
  showAnchor = false,
  uniformScale = false,
  className = "",
}: {
  id: number;
  cells?: Cell[];
  showAnchor?: boolean;
  uniformScale?: boolean;
  className?: string;
}) {
  const prefix = `fabric${useId().replace(/:/g, "")}`;
  const shape = cells ?? PATCHES[id]?.cells ?? [[0, 0]],
    w = Math.max(...shape.map((c) => c[0])) + 1,
    h = Math.max(...shape.map((c) => c[1])) + 1;
  return (
    <svg
      className={`patch-art ${className}`}
      viewBox={uniformScale ? `${-(5-w)*16-3} ${-(5-h)*16-3} 166 166` : `-3 -3 ${w * 32 + 6} ${h * 32 + 6}`}
      aria-hidden="true"
    >
      <FabricDefs prefix={prefix} ids={[id]} />
      <Cloth
        id={id}
        cells={shape}
        prefix={prefix}
        income={PATCHES[id]?.income ?? 0}
      />
      {showAnchor && (
        <g
          transform={`translate(${shape[0][0] * 32 + 16} ${shape[0][1] * 32 + 16})`}
        >
          <circle r="6" fill="#fff8df" stroke="#354c3e" strokeWidth="2" />
          <path d="M-3 0H3M0 -3V3" stroke="#354c3e" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
