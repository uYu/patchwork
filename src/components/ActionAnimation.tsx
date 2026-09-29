import { useEffect, useId, useRef, useState } from 'react';
import { Board } from './Board.tsx';
import { Cloth, FabricDefs } from './Fabric.tsx';
import { TimeBoard } from './TimeBoard.tsx';
import { actionCells } from '../game/engine.ts';
import { actionLabel, type HistoryEntry } from '../game/history.ts';
import { actionAnimationFrame } from '../game/animation.ts';

export function ActionAnimation({ entry, name, onComplete }: {
  entry: HistoryEntry; name: (i: number) => string; onComplete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const [elapsed, setElapsed] = useState(0);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const prefix = `action${useId().replace(/:/g, '')}`;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = now - start;
      if (actionAnimationFrame(entry, next, reduced).done) { complete.current(); return; }
      setElapsed(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); element?.close(); };
  }, [entry, reduced]);
  const phase = actionAnimationFrame(entry, elapsed, reduced);
  const action = entry.action;
  const boardState = phase.landed ? entry.after : entry.before;
  const trackState = phase.arrived ? entry.after : entry.before;
  const times: [number, number] = [trackState.players[0].time, trackState.players[1].time];
  times[entry.actor] = phase.time;
  const id = action.type === 'buy' ? action.piece : 33;
  return <dialog ref={dialog} className={`action-animation ${phase.leaving ? 'leaving' : ''}`} aria-labelledby={`${prefix}-title`}
    onCancel={e => { e.preventDefault(); complete.current(); }}>
    <header className="action-animation-heading">
      <div><span>刚刚完成的行动</span><h2 id={`${prefix}-title`}>{name(entry.actor)} · {actionLabel(action)}</h2></div>
      <button className="text-btn" onClick={() => complete.current()}>跳过动画</button>
    </header>
    <div className="action-animation-panes" inert>
      <section className="action-quilt-pane">
        <h3>{name(entry.actor)}的棋盘</h3>
        <div className="action-quilt-stage">
          <Board player={boardState.players[entry.actor]} state={boardState}
            highlight={phase.landed ? action : undefined} label={`${name(entry.actor)}放置动画棋盘`} />
          {action.type !== 'advance' && !phase.landed && <svg className="action-cloth-layer" viewBox="0 0 288 288" aria-hidden="true">
            <FabricDefs prefix={prefix} ids={[id]} />
            <g className="action-cloth"><Cloth id={id} prefix={prefix} cells={actionCells(action).map(([x,y]) => [action.x+x, action.y+y])} /></g>
          </svg>}
        </div>
        <p>{action.type === 'advance' ? '本步不放拼布，前进领取纽扣' : phase.landed ? '已缝入金色框标记的位置' : '正在缝入拼布…'}</p>
      </section>
      <section className="action-track-pane">
        <h3>前进 {entry.after.players[entry.actor].time - entry.before.players[entry.actor].time} 步 · {entry.before.players[entry.actor].time} → {entry.after.players[entry.actor].time}</h3>
        <TimeBoard state={trackState} name={name} pawnTimes={times} />
        <p>{action.type === 'leather' ? '皮革补丁不额外前进' : phase.arrived ? '已到达本步终点' : !phase.landed ? '拼布放好后，时间棋子前进' : '时间棋子沿轨道前进…'}</p>
      </section>
    </div>
    <footer className="action-animation-summary" aria-live="polite">
      成本 {entry.cost} 纽扣 · 纽扣 {entry.before.players[entry.actor].buttons} → {entry.after.players[entry.actor].buttons}
      {entry.earnedIncome > 0 && ` · 收入 +${entry.earnedIncome}`}
      {entry.leather > 0 && ` · 领取 ${entry.leather} 块皮革`}
      {entry.bonus && ' · 获得 7 × 7 奖励！'}
    </footer>
  </dialog>;
}
