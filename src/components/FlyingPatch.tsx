import { useLayoutEffect, useState } from "react";
import { FORMS } from "../game/data.ts";
import { actionCells } from "../game/engine.ts";
import type { HistoryEntry } from "../game/history.ts";
import { Patch } from "./Patch.tsx";

type Rect = { x: number; y: number; width: number; height: number };
type Flight = { entry: HistoryEntry; from: Rect; to: Rect };

export function FlyingPatch({ entry, progress }: { entry: HistoryEntry; progress: number }) {
  const [flight, setFlight] = useState<Flight | null>(null);
  useLayoutEffect(() => {
    const action = entry.action;
    if (action.type !== "buy") return;
    const source = document.querySelector<HTMLElement>(`.table-ring-patch[data-piece-id="${action.piece}"]`);
    const board = document.querySelector<HTMLElement>(`.table-ring-center .quilt[data-player="${entry.actor}"]`);
    const cells = actionCells(action).map(([dx, dy]) =>
      board?.querySelector<HTMLElement>(`[data-cell="${(action.y + dy) * 9 + action.x + dx}"]`),
    );
    if (!source || !board || cells.some(cell => !cell)) return;
    const origin = source.querySelector(".patch-art")?.getBoundingClientRect() ?? source.getBoundingClientRect();
    const bounds = cells.map(cell => cell!.getBoundingClientRect());
    const left = Math.min(...bounds.map(rect => rect.left));
    const top = Math.min(...bounds.map(rect => rect.top));
    const right = Math.max(...bounds.map(rect => rect.right));
    const bottom = Math.max(...bounds.map(rect => rect.bottom));
    const size = 32 / Math.max(right - left, bottom - top);
    setFlight({ entry,
      from: { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2, width: (right - left) * size, height: (bottom - top) * size },
      to: { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top },
    });
  }, [entry]);
  if (!flight || flight.entry !== entry || entry.action.type !== "buy") return null;
  const t = 1 - (1 - progress) ** 3;
  const width = flight.from.width + (flight.to.width - flight.from.width) * t;
  const height = flight.from.height + (flight.to.height - flight.from.height) * t;
  const x = flight.from.x + (flight.to.x - flight.from.x) * t;
  const y = flight.from.y + (flight.to.y - flight.from.y) * t - Math.sin(Math.PI * t) * 46;
  return <div className="flying-patch" aria-hidden="true" style={{ left: x - width / 2, top: y - height / 2, width, height, transform: `rotate(${(1 - t) * -8}deg)` }}>
    <Patch id={entry.action.piece} cells={FORMS[entry.action.piece][entry.action.orientation]} />
  </div>;
}
