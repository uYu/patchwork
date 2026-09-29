import { useEffect, useRef } from "react";
import { Check, ArrowDown } from "lucide-react";
import { actionLabel, actionPosition, type HistoryEntry } from "../game/history.ts";
import { score, winner } from "../game/engine.ts";
import type { AIResult, State } from "../game/types.ts";
export function ScoreRecord({ state, name }: { state: State; name: (i: number) => string }) {
  return <section className="score-record" aria-label="终局得分记录">
    <h3>终局得分记录 · {name(winner(state) ?? 0)}获胜</h3>
    <div className="score-table">{state.players.map((p, i) => <div key={i}>
      <strong>{name(i)}</strong>
      <span>纽扣余额 <b>{p.buttons}</b></span>
      <span>空格 {p.board.filter(v => v < 0).length} × −2 <b>−{p.board.filter(v => v < 0).length * 2}</b></span>
      <span>7 × 7 奖励 <b>+{p.bonus ? 7 : 0}</b></span>
      <strong className="final-score">{score(p)}<small> 分</small></strong>
    </div>)}</div>
    {score(state.players[0]) === score(state.players[1]) && <p>同分，{name(state.firstFinished ?? 0)}先到终点，获胜。</p>}
  </section>;
}
export function StepDetail({ entry }: { entry: HistoryEntry }) {
  const p = entry.before.players[entry.actor], q = entry.after.players[entry.actor];
  return <span className="step-detail">
    <span>{actionPosition(entry.action)}{entry.action.type !== "advance" ? " · " : ""}时间 {p.time} → {q.time} · 纽扣 {p.buttons} → {q.buttons} · 收入 {p.income} → {q.income} · 得分 {score(p)} → {score(q)}</span>
    <span>{entry.action.type === "advance" ? `前进获得 ${q.time - p.time} 纽扣` : entry.cost ? `购买花费 ${entry.cost} 纽扣` : "免费补丁"}
      {entry.incomeCount > 0 && ` · 越过 ${entry.incomeCount} 个收入点，获得 ${entry.earnedIncome} 纽扣`}
      {entry.leather > 0 && ` · 领取 ${entry.leather} 块皮革`}
      {entry.bonus && " · 首次完成 7 × 7，获得 +7 分！"}
      {entry.after.over && " · 对局结束"}</span>
  </span>;
}
export function MoveHistory({ entries, index, name, onSeek }: {
  entries: HistoryEntry[]; index: number; name: (i: number) => string; onSeek: (index: number) => void;
}) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const row = current.current, list = row?.closest("ol");
    if (row && list) {
      list.scrollLeft += row.getBoundingClientRect().left - list.getBoundingClientRect().left - list.clientWidth / 2 + row.clientWidth / 2;
      list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2 + row.clientHeight / 2;
    }
  }, [index, entries.length]);
  return <section className="log panel move-history" aria-label="历史操作记录">
    <div className="section-label"><h2>行动日志</h2><span>{entries.length} 步 · 点击查看行动和落点</span></div>
    <div className="history-controls"><button className="text-btn" onClick={() => onSeek(0)}>从头回放</button><span>当前查看：{index === 0 ? "初始局面" : `第 ${index} 步之后`}</span></div>
    {entries.length === 0 ? <p className="muted">双方行动后，每一步会依次显示在这里。</p> : <ol className="history-list move-strip">
      {entries.map((entry, i) => <li key={i}>
        <button ref={index === i + 1 ? current : undefined} className={i === entries.length - 1 ? "latest-step" : ""} aria-current={index === i + 1 ? "step" : undefined} onClick={() => onSeek(i + 1)}>
          <span className="move-number">#{i + 1} · {name(entry.actor)}{i === entries.length - 1 && <b>最近一步</b>}</span>
          <strong>{actionLabel(entry.action)}</strong>
          <span>{entry.action.type === "advance" ? `时间 ${entry.before.players[entry.actor].time} → ${entry.after.players[entry.actor].time}` : actionPosition(entry.action)}</span>
        </button>
      </li>)}
    </ol>}
  </section>;
}
export function LatestMove({ entry, index, name, onSeek }: {
  entry: HistoryEntry; index: number; name: (i: number) => string; onSeek: (index: number) => void;
}) {
  return <section className="latest-action panel" aria-label="最近一步详情">
    <div className="latest-action-copy" aria-live="polite">
      <span className="latest-label">最近一步 · #{index}</span>
      <h2>{name(entry.actor)} · {actionLabel(entry.action)}</h2>
      <StepDetail entry={entry} />
      <p>{entry.action.type === "advance" ? "本步只前进领取纽扣，棋盘没有新增拼布。" : "主棋盘上的金色框标出了这一步填入的全部格子。点击拼布可查看成本和前进步数。"}</p>
      <button className="text-btn" onClick={() => onSeek(index)}>查看这一步的完整复盘 →</button>
    </div>

  </section>;
}

export function DecisionReview({ entry, detail, name, isAI }: {
  entry: HistoryEntry; detail?: AIResult; name: (i: number) => string; isAI: boolean;
}) {
  const chosenCard = useRef<HTMLElement>(null);
  const groups = new Map<string, NonNullable<AIResult["candidates"]>>();
  detail?.candidates?.forEach(candidate => {
    const a = candidate.action, key = a.type === "buy" ? `拼布 ${a.piece + 1}` : a.type === "leather" ? "皮革补丁" : "前进";
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  });
  const chosenGroup = [...groups].find(([, candidates]) => candidates.some(c => JSON.stringify(c.action) === JSON.stringify(entry.action)));
  const chosenIndex = chosenGroup?.[1].findIndex(c => JSON.stringify(c.action) === JSON.stringify(entry.action));
  return <section className="panel decision-review" aria-label="逐步复盘详情">
    <h2>{name(entry.actor)} · {actionLabel(entry.action)}</h2>
    <StepDetail entry={entry} />
    {isAI && <div className="final-choice-banner" aria-label="AI 最终选择">
      <span className="final-choice-seal" aria-hidden="true"><Check size={28} strokeWidth={3} /></span>
      <div className="final-choice-copy"><strong>AI 最终选择</strong>
        <span>{chosenGroup ? `${chosenGroup[0]} · 候选 ${(chosenIndex ?? 0) + 1}` : actionLabel(entry.action)}</span>
        <small>{entry.action.type === "advance" ? `前进至 ${entry.after.players[entry.actor].time} 格` : actionPosition(entry.action)}</small>
      </div>
      {chosenGroup && <button onClick={() => { chosenCard.current?.scrollIntoView({ behavior: "smooth", block: "center" }); chosenCard.current?.focus({ preventScroll: true }); }}><ArrowDown size={17} />定位选中方案</button>}
    </div>}
    {isAI && <>
      <h3>AI 当时的候选落点</h3>
      {detail ? <p className="muted">{detail.strategy === "advanced" || detail.strategy === "research2" ? "连通模型筛选 + 全局前瞻 + 布局模拟 · 每块拼布最多 9 个落点" : detail.strategy === "research" ? "模型筛选 + 全局前瞻 · 每块拼布最多 9 个落点" : detail.modelUsed ? "模型筛选 · 旧版每块拼布最多 8 个落点" : detail.modelEvaluations ? "模型排序超时 · 使用启发式候选" : "启发式选择"} · {detail.simulations} 次模拟 · {detail.elapsed} ms。候选数不足时显示实际数量；前进单独列出。</p> : null}
      {!detail?.candidates?.length ? <p className="muted">{detail?.backend === "typescript" ? "入门 AI 未进行候选搜索，仅记录最终行动。" : "这一步未保存候选详情。旧存档仍可回放，新对局会记录当时的候选。"}</p> : <>
        <p className="muted">高亮为最终选择。搜索均值范围 −1～+1，越高对 AI 越有利；它不是最终得分或校准胜率。未探索的候选不显示均值。</p>
        {[...groups].map(([group, candidates]) => <section className="candidate-group" key={group}>
          <h3>{group} · {candidates.length} 个候选</h3>
          <div className="review-candidates">{candidates.map((candidate, i) => {
            const selected = JSON.stringify(candidate.action) === JSON.stringify(entry.action);
            return <article key={i} ref={selected ? chosenCard : undefined} tabIndex={selected ? -1 : undefined} aria-label={`${group}候选 ${i + 1}${selected ? "，AI 最终选择" : "，未选择"}`} className={`review-candidate ${selected ? "chosen" : ""}`}>
              {selected && <div className="chosen-ribbon"><Check size={20} strokeWidth={3} /><strong>AI 最终选择</strong></div>}
              <div className="candidate-card-heading"><strong>候选 {i + 1}</strong><span>{selected ? "已采用" : "未选择"}</span></div>
              {candidate.action.type === "advance" && <p>前进至 {Math.min(53, entry.before.players[1 - entry.actor].time + 1)} 格</p>}
              <span>{candidate.action.type === "advance" ? "前进领取纽扣" : actionPosition(candidate.action)}</span>
              <small>{candidate.visits} 次模拟 · {candidate.meanValue === null ? "未探索" : `均值 ${candidate.meanValue.toFixed(3)}`}</small>
            </article>;
          })}</div>
        </section>)}
      </>}
    </>}
  </section>;
}
