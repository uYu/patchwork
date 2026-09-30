import { useMemo, useState } from "react";
import { Board } from "./Board.tsx";
import { Patch } from "./Patch.tsx";
import { FORMS, PATCHES, flip, rotate } from "../game/data.ts";
import { actionCells, available, fits } from "../game/engine.ts";
import { placementAction } from "../game/placement.ts";
import type { Action, State } from "../game/types.ts";

type Trial = Extract<Action, { type: "buy" }>;

function fullSeven(board: number[]) {
  for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) {
    let full = true;
    for (let dy = 0; dy < 7 && full; dy++) for (let dx = 0; dx < 7; dx++)
      if (board[(y + dy) * 9 + x + dx] < 0) { full = false; break; }
    if (full) return true;
  }
  return false;
}

export function PracticeMode({ state, actor, onClose }: { state: State; actor: 0 | 1; onClose: () => void }) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [piece, setPiece] = useState<number | null>(null);
  const [orientation, setOrientation] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const board = useMemo(() => {
    const copy = [...state.players[actor].board];
    for (const trial of trials) for (const [dx, dy] of actionCells(trial))
      copy[(trial.y + dy) * 9 + trial.x + dx] = trial.piece;
    return copy;
  }, [state, actor, trials]);
  const trialState = useMemo(() => ({
    ...state,
    players: state.players.map((player, i) => i === actor ? { ...player, board } : player) as State["players"],
  }), [state, actor, board]);
  const used = new Set(board.filter(id => id >= 0 && id < PATCHES.length));
  const market = new Set(available(state));
  const previewAt = anchor ?? hover;
  const previewAction = piece === null || previewAt === null ? null : placementAction(previewAt, piece, orientation);
  const preview = previewAction?.type === "buy" ? previewAction : null;
  const valid = !!preview && fits(board, actionCells(preview), preview.x, preview.y);
  const empty = board.filter(id => id < 0).length;

  const select = (id: number) => {
    if (used.has(id)) return;
    setPiece(id);
    setOrientation(0);
    setAnchor(null);
    setHover(null);
  };
  const transform = (kind: "left" | "right" | "flip") => {
    if (piece === null) return;
    const shape = FORMS[piece][orientation];
    const next = kind === "right" ? rotate(shape) : kind === "left" ? rotate(rotate(rotate(shape))) : flip(shape);
    setOrientation(FORMS[piece].findIndex(form => JSON.stringify(form) === JSON.stringify(next)));
  };
  const add = () => {
    if (!preview || !valid || used.has(preview.piece)) return;
    setTrials([...trials, preview]);
    setPiece(null);
    setAnchor(null);
    setHover(null);
  };
  return <div className="practice-mode">
    <p className="practice-intro">在当前棋盘的副本上试摆。可任意选未放在本棋盘上的拼布，不受市场顺序、纽扣或时间限制；退出后正式对局不会改变。</p>
    <div className="practice-layout">
      <section className="practice-stage" aria-label="练习棋盘">
        <div className="practice-summary"><strong>试摆棋盘</strong><span>未填 {empty} 格 · 已试 {trials.length} 块 {fullSeven(board) && <b>· 7 × 7 已填满</b>}</span></div>
        <div className={`practice-board board-wrap player-color-${actor}`}>
          <Board player={trialState.players[actor]} state={trialState} label="练习用 9 × 9 拼布棋盘"
            interactive={piece !== null} preview={preview ?? undefined} previewValid={valid}
            pointerCell={previewAt} onHover={setHover} onPlace={setAnchor} />
        </div>
        <div className="practice-placement">
          <span>{piece === null ? "从右侧挑一块拼布" : valid ? `落点：${preview!.y + 1} 行 ${preview!.x + 1} 列` : anchor === null ? "点击棋盘试位置" : "此处重叠或越界，请换一格"}</span>
          <div>
            <button type="button" disabled={piece === null} onClick={() => transform("left")} aria-label="练习中逆时针旋转">↶</button>
            <button type="button" disabled={piece === null} onClick={() => transform("right")} aria-label="练习中顺时针旋转">↷</button>
            <button type="button" disabled={piece === null} onClick={() => transform("flip")} aria-label="练习中翻转">⇋</button>
            <button type="button" className="primary" disabled={!valid} onClick={add}>放入试摆</button>
          </div>
        </div>
      </section>
      <section className="practice-tools" aria-label="练习拼布与撤回">
        <div className="practice-tool-heading"><strong>任选拼布</strong><span>绿点是当前可买的三块</span></div>
        <div className="practice-gallery" role="group" aria-label="所有拼布图案">
          {PATCHES.map(patch => <button type="button" key={patch.id}
            className={`${piece === patch.id ? "selected" : ""} ${market.has(patch.id) ? "in-market" : ""}`}
            aria-pressed={piece === patch.id} disabled={used.has(patch.id)}
            aria-label={`${patch.id + 1} 号拼布${market.has(patch.id) ? "，当前可买" : ""}${used.has(patch.id) ? "，已放在棋盘" : ""}`}
            onClick={() => select(patch.id)}>
            <span>{market.has(patch.id) && <i aria-hidden="true" />} {String(patch.id + 1).padStart(2, "0")}</span>
            <Patch id={patch.id} uniformScale />
          </button>)}
        </div>
        <div className="practice-tool-heading"><strong>试摆记录</strong><span>可撤回任意一块</span></div>
        <div className="practice-trials">
          {trials.length === 0 ? <p>还没有试摆的拼布。</p> : trials.map((trial, index) => <div key={`${trial.piece}-${index}`}>
            <Patch id={trial.piece} cells={FORMS[trial.piece][trial.orientation]} />
            <span>{index + 1}. {trial.piece + 1} 号 · {trial.y + 1} 行 {trial.x + 1} 列</span>
            <button type="button" onClick={() => setTrials(trials.filter((_, i) => i !== index))}>撤回</button>
          </div>)}
        </div>
        <div className="practice-actions">
          <button type="button" disabled={!trials.length} onClick={() => setTrials(trials.slice(0, -1))}>撤回上一步</button>
          <button type="button" disabled={!trials.length} onClick={() => setTrials([])}>清空试摆</button>
          <button type="button" className="primary" onClick={onClose}>返回正式对局</button>
        </div>
      </section>
    </div>
  </div>;
}
