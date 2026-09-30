import { DecisionReview, MoveHistory, ScoreRecord } from "./components/History.tsx";
import { useActionAnimation } from "./components/useActionAnimation.ts";
import { TableMarket } from "./components/TableMarket.tsx";
import { FlyingPatch } from "./components/FlyingPatch.tsx";
import { PracticeMode } from "./components/PracticeMode.tsx";
import { history, describeStep, type HistoryEntry } from "./game/history.ts";
import { placementAction } from "./game/placement.ts";
import { TimeBoard } from "./components/TimeBoard.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Download,
  FlipHorizontal2,
  Home,
  Pause,
  Play,
  RotateCw,
  RotateCcw,
  Scissors,
  Upload,
  Undo2,
} from "lucide-react";
import { Board } from "./components/Board.tsx";
import { Dialog } from "./components/Dialog.tsx";
import { Rules } from "./components/Rules.tsx";
import { COLORS, FORMS, PATCHES, flip, rotate } from "./game/data.ts";
import { applyAction, isLegal, score, winner } from "./game/engine.ts";
import { downloadSave, parseSave, replay, SAVE_KEY, MAX_SAVE_BYTES } from "./game/storage.ts";
import type { Action, AIResult, Difficulty, Mode, Save } from "./game/types.ts";
const DIFFICULTY = { easy: "入门", normal: "熟练", hard: "高级" };
function load(): { save: Save | null; error: string } {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return { save: text ? parseSave(text) : null, error: "" };
  } catch {
    return {
      save: null,
      error: "本地存档不可用。你仍可开始新局，并导出备份。",
    };
  }
}
export default function App() {
  const [initial] = useState(load),
    [save, setSave] = useState<Save | null>(initial.save),
    [screen, setScreen] = useState<"menu" | "game">("menu");
  const [modal, setModal] = useState<
      "rules" | "new" | "pause" | "practice" | "result" | null
    >(null),
    [difficulty, setDifficulty] = useState<Difficulty>("hard"),
    [mode, setMode] = useState<Mode>("ai");
  const [animation, setAnimation] = useState<HistoryEntry | null>(null);
  const [watchPaused, setWatchPaused] = useState(false);
  const [advanceSelected, setAdvanceSelected] = useState(false);
  const [piece, setPiece] = useState<number | null>(null),
    [orientation, setOrientation] = useState(0),
    [anchor, setAnchor] = useState<number | null>(null),
    [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState(initial.error),
    [aiError, setAIError] = useState(""),
    [thinking, setThinking] = useState(false),
    [stats, setStats] = useState<AIResult | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null),
    [playing, setPlaying] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null);
  const state = useMemo(
    () => (save ? replay(save, replayIndex ?? save.actions.length) : null),
    [save, replayIndex],
  );
  const entries = useMemo(() => save ? history(save) : [], [save]);
  const shownIndex = replayIndex ?? save?.actions.length ?? 0;
  const currentEntry = entries[shownIndex - 1];
  const finalState = entries.at(-1)?.after;
  const isReplay = replayIndex !== null,
    human =
      !!state &&
      !state.over &&
      !isReplay &&
      !animation &&
      (save?.mode === "local" || (save?.mode === "ai" && state.current === 0));
  const phase = useActionAnimation(animation, screen === "game" && !modal && !(save?.mode === "watch" && watchPaused), () => setAnimation(null));
  const boardState = animation && phase && !phase.landed ? animation.before : state;
  const trackState = animation && phase && !phase.arrived ? animation.before : state;
  const pawnTimes: [number, number] | undefined = animation && phase ? [
    animation.actor === 0 ? phase.time : animation.before.players[0].time,
    animation.actor === 1 ? phase.time : animation.before.players[1].time,
  ] : undefined;
  const active = !!state && screen === "game" && !modal && !animation;
  const shownStats = isReplay ? save?.analysis?.[shownIndex - 1] : stats;
  const commit = (action: Action) => {
    if (!save || !state || isReplay || animation) return;
    try {
      const after = applyAction(state, action);
      setAnimation(describeStep(state, action, after));
      setSave({ ...save, actions: [...save.actions, action] });
      setAdvanceSelected(false);
      setPiece(null);
      setAnchor(null);
      setHover(null);
      setOrientation(0);
      setError("");
    } catch {
      setError("这个位置无法放置，请重新选择。");
    }
  };
  useEffect(() => {
    if (!save) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      setError("自动保存失败，请使用导出备份。");
    }
  }, [save]);
  useEffect(() => {
    if (
      !state ||
      !save ||
      !active ||
      isReplay ||
      state.over ||
      (save.mode !== "watch" && (save.mode !== "ai" || state.current !== 1)) ||
      (save.mode === "watch" && watchPaused)
    ) {
      setThinking(false);
      return;
    }
    setAIError("");
    setThinking(true);
    const w = new Worker(new URL("./game/ai.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    let cancelled = false;
    w.onmessage = (e: MessageEvent<AIResult & { error?: string }>) => {
      if (cancelled) return;
      if (e.data.error) {
        setAIError(e.data.error);
        setThinking(false);
        w.terminate();
        return;
      }
      if (!isLegal(state, e.data.action)) {
        setAIError("AI 返回了无效行动");
        setThinking(false);
        w.terminate();
        return;
      }
      setAnimation(describeStep(state, e.data.action, applyAction(state, e.data.action)));
      setStats(e.data);
      setSave((prev) =>
        prev === save
          ? { ...save, actions: [...save.actions, e.data.action], analysis: { ...save.analysis, [save.actions.length]: e.data } }
          : prev,
      );
      setThinking(false);
      w.terminate();
    };
    w.onerror = () => {
      setAIError("AI Worker 加载失败");
      setThinking(false);
      w.terminate();
    };
    const launch = window.setTimeout(() => w.postMessage({
      state,
      difficulty: save.difficulty,
      seed: (save.seed + save.actions.length * 7919) >>> 0,
    }), save.mode === "watch" && save.actions.length > 0 ? 750 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(launch);
      w.terminate();
      worker.current = null;
    };
  }, [state, save, active, isReplay, watchPaused]);
  useEffect(() => {
    if (state?.over && !isReplay && !animation && screen === "game") setModal("result");
  }, [state?.over, isReplay, screen, animation]);
  useEffect(() => {
    if (!playing || replayIndex === null || !save || modal || screen !== "game")
      return;
    if (replayIndex >= save.actions.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setReplayIndex((i) => (i ?? 0) + 1), 850);
    return () => clearTimeout(timer);
  }, [playing, replayIndex, save, modal, screen]);
  const begin = () => {
    setAnimation(null);
    const [seed, coin] = crypto.getRandomValues(new Uint32Array(2));
    const firstPlayer = mode === "ai" ? (coin & 1) as 0 | 1 : 0;
    setSave({ version: 1, seed, firstPlayer, difficulty, mode, actions: [] });
    setScreen("game");
    setModal(null);
    setReplayIndex(null);
    setPlaying(false);
    setPiece(null);
    setAnchor(null);
    setHover(null);
    setAdvanceSelected(false);
    setOrientation(0);
    setStats(null);
    setWatchPaused(false);
    setError("");
  };
  const name = (i: number) =>
    save?.mode === "local"
      ? `玩家${i === 0 ? "一" : "二"}`
      : save?.mode === "watch"
        ? `小织 · ${i === 0 ? "甲" : "乙"}`
      : i === 0
        ? "你"
        : "裁缝 · 小织";
  const transform = (kind: "rotate" | "counterclockwise" | "flip") => {
    if (piece === null) return;
    const shape = FORMS[piece][orientation];
    const next =
      kind === "rotate"
        ? rotate(shape)
        : kind === "counterclockwise"
          ? rotate(rotate(rotate(shape)))
          : flip(shape);
    setOrientation(
      FORMS[piece].findIndex((s) => JSON.stringify(s) === JSON.stringify(next)),
    );
  };
  const makeAction = (at: number | null): Action | undefined =>
    at === null || !state
      ? undefined
      : state.pending
        ? { type: "leather", x: at % 9, y: Math.floor(at / 9) }
        : piece !== null
          ? placementAction(at, piece, orientation)
          : undefined;
  const preview = advanceSelected ? undefined : makeAction(anchor ?? hover),
    chosen: Action | undefined = advanceSelected && !state?.pending ? {type: "advance"} : makeAction(anchor);
  const advanceSteps = state ? Math.max(0, Math.min(53, state.players[1 - state.current].time + 1) - state.players[state.current].time) : 0;
  const exitReplay = () => {
    setReplayIndex(null);
    setPlaying(false);
    setPiece(null);
    setAnchor(null);
    setHover(null);
  };
  const startReplay = () => {
    setAnimation(null);
    setReplayIndex(0);
    setPlaying(false);
    setModal(null);
    setScreen("game");
    setPiece(null);
    setAnchor(null);
    setHover(null);
  };
  const seekReplay = (index: number) => {
    startReplay();
    setReplayIndex(index);
    requestAnimationFrame(() => {
      const sidebar = document.querySelector(".activity-sidebar");
      if (sidebar) sidebar.scrollTop = 0;
    });
  };
  const importFile = async (f: File) => {
    try {
      if (f.size > MAX_SAVE_BYTES) throw new Error("存档不能超过 2 MB");
      const next = parseSave(await f.text());
      setSave(next);
      setScreen("game");
      setModal(null);
      exitReplay();
      setPiece(null);
      setAnchor(null);
      setHover(null);
      setAdvanceSelected(false);
      setOrientation(0);
      setStats(null);
      setWatchPaused(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法导入存档");
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("menu");
            setPlaying(false);
          }}
        >
          <span className="brand-mark">
            <Scissors size={22} />
          </span>
          <span>
            拼布艺术<small>PATCHWORK ATELIER</small>
          </span>
        </a>
        <nav>
          <button className="text-btn" onClick={() => setModal("rules")}>
            <BookOpen size={17} />
            规则
          </button>
          {screen === "game" && (
            <>
              <button className="text-btn" onClick={() => setModal("pause")}>
                <Pause size={17} />
                暂停
              </button>
              <button
                className="icon-btn"
                aria-label="返回菜单"
                onClick={() => {
                  setScreen("menu");
                  setPlaying(false);
                }}
              >
                <Home size={19} />
              </button>
            </>
          )}
        </nav>
      </header>
      {error && (
        <div className="notice" role="alert">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      <input
        ref={file}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      {screen === "menu" ? (
        <main className="menu">
          <section className="intro">
            <div className="eyebrow">A LITTLE TIME. A LITTLE THREAD.</div>
            <h1>
              一针一线，
              <br />
              拼出你的<span>小世界。</span>
            </h1>
            <p>
              挑一块喜欢的布，算一算手里的纽扣。
              <br />
              在时间走完之前，缝好一床独一无二的被子。
            </p>
            <div className="menu-actions">
              <button className="primary large" onClick={() => { setMode("ai"); setDifficulty("hard"); setModal("new"); }}>
                开始新作品 <ArrowRight size={20} />
              </button>
              <button className="secondary large" onClick={() => {
                setMode("watch");
                setDifficulty("hard");
                setModal("new");
              }}>
                观看 AI 对弈 <Play size={18} />
              </button>
              {save && (
                <button
                  className="secondary large"
                  onClick={() => {
                    exitReplay();
                    setScreen("game");
                  }}
                >
                  {save.mode === "watch" ? "继续观战" : "继续缝制"}
                </button>
              )}
            </div>
            <div className="menu-links">
              <button onClick={() => file.current?.click()}>导入存档</button>
              {save && (
                <>
                  <button onClick={() => downloadSave(save)}>导出存档</button>
                  <button onClick={startReplay}>回看上一局</button>
                </>
              )}
            </div>
            <div className="facts">
              <span>01—02 玩家</span>
              <span>9 × 9 拼布棋盘</span>
              <span>本地 C++ AI</span>
            </div>
          </section>
          <div className="hero-art" aria-hidden="true">
            <div className="paper-tag">
              THE QUILT CLUB <span>手作时光 · No. 033</span>
            </div>
            <div className="hero-quilt">
              {Array.from({ length: 81 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    background:
                      COLORS[
                        (Math.floor(i / 18) +
                          Math.floor((i % 9) / 3) * 3 +
                          (i > 53 ? 2 : 0)) %
                          8
                      ],
                  }}
                />
              ))}
            </div>
            <div className="spool spool-one">✣</div>
            <div className="spool spool-two">✣</div>
            <div className="hand-note">
              把零碎，缝成美好。
              <svg viewBox="0 0 120 30">
                <path d="M4 15 Q60 35 111 4 M101 4 L113 3 L109 15" />
              </svg>
            </div>
          </div>
          <footer>
            纽扣是货币，时间是选择。<span>无需账号 · 自动保存 · 随时继续</span>
          </footer>
        </main>
      ) : state && save ? (
        <main className="game">
          {!isReplay && !state.over && save.mode !== "watch" && (
            <div className={`turn-guide ${animation ? "turn-guide-animation" : human ? state.pending ? "turn-guide-leather" : "turn-guide-human" : "turn-guide-thinking"}`} role="status" aria-live="polite" aria-atomic="true">
              <span className="turn-guide-mark" aria-hidden="true">{animation ? "✦" : human ? state.pending ? "✚" : "✓" : "◌"}</span>
              <div>
                <strong>{animation ? `${name(animation.actor)}正在完成行动` : human ? state.pending ? `轮到${name(state.current)}缝小补丁` : `轮到${name(state.current)}了` : aiError ? "小织暂时无法落子" : "小织正在思考…"}</strong>
                <span>{animation ? "本步结束后会提示下一位行动者。" : human ? state.pending ? `免费 1 × 1 小补丁，还有 ${state.pending} 块待缝；请点击棋盘空格，再确认。` : "请选择缝拼布或前进赚纽扣，完成后点击确认。" : aiError ? "请使用下方的“切换入门 AI 继续”。" : "请稍候，落子完成后会提醒你行动。"}</span>
              </div>
            </div>
          )}
          {save.mode === "watch" && !state.over && !isReplay && <div className="watch-controls" role="status">
            <div><strong>AI 对弈进行中</strong><span>{watchPaused ? "已暂停" : thinking ? `${name(state.current)}正在思考…` : "准备下一步…"} · 第 {save.actions.length} 步</span></div>
            <button className="secondary" onClick={() => setWatchPaused(!watchPaused)}>
              {watchPaused ? <Play size={16} /> : <Pause size={16} />}
              {watchPaused ? "继续观战" : "暂停观战"}
            </button>
          </div>}
          {!isReplay && currentEntry?.bonus && state.bonusOwner !== null && <div className="bonus-notice" role="alert">
            <span className="bonus-notice-icon" aria-hidden="true">✦</span>
            <strong>7 × 7 完成！</strong>
            <span>{name(state.bonusOwner)} 获得本局唯一奖励</span>
            <b>+7 分</b>
          </div>}
          <div className="table-layout tabletop-layout">
            <div className="play-area">
              <TableMarket state={animation?.before ?? state} human={human} piece={piece} flyingPiece={animation?.action.type === "buy" && phase?.flying ? animation.action.piece : null} onSelect={id => {
                setAdvanceSelected(false); setPiece(id); setOrientation(0); setAnchor(null); setHover(null);
              }}>
              <div className="inline-action-status" role="status">
                {animation ? <><strong>{name(animation.actor)} · {animation.action.type === "advance" ? "前进赚纽扣" : phase?.flying ? "拼布从布料环飞向棋盘" : phase?.landed ? "拼布已落下 · 时间棋子前进" : "正在缝上拼布"}</strong><button className="text-btn" onClick={() => setAnimation(null)}>跳过动画</button></> : <span>{human ? chosen && !isLegal(state, chosen) ? "这个落点重叠或越界，请换一格" : state.pending ? `小补丁待放：还剩 ${state.pending} 块，点击棋盘空格` : advanceSelected ? `已选前进 ${advanceSteps} 格、获得 ${advanceSteps} 纽扣；在棋盘下方确认` : piece !== null ? `已选 ${piece + 1} 号拼布：成本 ${PATCHES[piece].cost} · 前进 ${PATCHES[piece].time} · 收入 +${PATCHES[piece].income}；点击棋盘定位` : "点击外圈绿框拼布选购，再在棋盘上定位" : save.mode === "ai" ? "小织正在思考，请稍候" : "双方自动落子中"}</span>}
              </div>
              <div className="action-slot">
              {human ? (state.pending ? <div className="action-choice guided leather-choice" aria-label="小补丁行动">
                <strong>先缝小补丁 · 剩余 {state.pending} 块</strong>
                <small>免费填 1 格，不消耗时间。点击棋盘空格选位置，再按“确认缝上小补丁”。</small>
              </div> : <div className="action-choice guided practice-available" aria-label="本回合行动">
                <strong>本回合选一项</strong>
                <div className="action-options">
                  <button className={!advanceSelected ? "selected" : ""} aria-pressed={!advanceSelected}
                    onClick={() => setAdvanceSelected(false)}><b>缝上拼布</b><span>选布并放置</span></button>
                  <button className={advanceSelected ? "selected" : ""} aria-pressed={advanceSelected}
                    onClick={() => {setAdvanceSelected(true);setAnchor(null);setHover(null);}}><b>前进赚纽扣</b><span>+{advanceSteps} 纽扣 · {advanceSteps} 步</span></button>
                  <button className="practice-open" onClick={() => setModal("practice")}><b>练习摆放</b><span>试拼可撤回</span></button>
                </div>
                <small>{advanceSelected ? `已选前进：将获得 ${advanceSteps} 枚纽扣。按棋盘下方的按钮确认。` : piece !== null ? `已选 ${piece + 1} 号拼布：花费 ${PATCHES[piece].cost} 纽扣，前进 ${PATCHES[piece].time} 格，收入 +${PATCHES[piece].income}。点击棋盘选位置。` : "先点击上方绿框的可买拼布，再在棋盘选落点。"}</small>
              </div>) : <div className="action-choice guided action-choice-wait" aria-hidden="true">
                <strong>{animation ? "正在完成这一步" : isReplay ? "正在回放" : state.over ? "本局已结束" : save.mode === "watch" ? watchPaused ? "观战已暂停" : "AI 对弈中" : "小织正在思考"}</strong>
                <small>行动完成后，这里会显示下一步可选的操作。</small>
              </div>}
              </div>
            <div className="board-row">
            <section className="your-side">

              {(() => {
                const i = save.mode === "local" ? (animation?.actor ?? state.current) : 0,
                  p = (boardState ?? state).players[i];
                return (
                  <>
                    <div className="board-heading">
                      <div>
                        <span className={`dot ${i === 0 ? "teal" : "rose"}`} />
                        <h2>{name(i)}的拼布</h2>
                        <span className={`turn-tag ${human ? "on" : ""}`}>
                          {animation?.actor === i
                            ? "行动动画"
                            : state.over
                            ? "已完成"
                            : isReplay
                              ? "回放中"
                              : human
                                ? save.mode === "local" ? `轮到${name(i)}了` : "轮到你了"
                                : save.mode === "watch"
                                  ? state.current === i ? "正在思考" : "等待落子"
                                : "等待对手"}
                        </span>
                      </div>
                      <span className="filled-count">
                        {p.board.filter((v) => v >= 0).length} / 81 格
                      </span>
                    </div>
                    <div className={`board-wrap player-color-${i}`}>
                      <div
                        className="board-surface has-placement-tools"
                      >
                        <Board
                          key={i}
                          player={p}
                          state={boardState ?? state}
                          landing={animation?.actor === i && !phase?.landed && !phase?.flying ? animation.action : undefined}
                          highlight={(!animation || phase?.landed) && currentEntry?.actor === i ? currentEntry.action : undefined}
                          preview={human ? preview : undefined}
                          pointerCell={human ? (anchor ?? hover) : null}
                          interactive={human && !modal && !advanceSelected && (piece !== null || state.pending > 0)}
                          onHover={(cell) => {
                            if (anchor === null) setHover(cell);
                          }}
                          onPlace={(i) => {
                            setAnchor(i);
                            setHover(null);
                          }}
                          label={`${name(i)}的 9 × 9 拼布棋盘`}
                        />
                        {human && (
                          <div
                            className="placement-actions board-placement-tools"
                            role="group"
                            aria-label="拼布落点操作"
                            onMouseEnter={() => setHover(null)}
                            onFocus={() => setHover(null)}
                          >
                            {!state.pending && !advanceSelected && piece !== null && (
                              <>
                                <button
                                  className="icon-btn"
                                  title="逆时针旋转"
                                  aria-label="逆时针旋转拼布"
                                  onClick={() => transform("counterclockwise")}
                                >
                                  <RotateCcw size={19} />
                                </button>
                                <button
                                  className="icon-btn"
                                  title="顺时针旋转"
                                  aria-label="顺时针旋转拼布"
                                  onClick={() => transform("rotate")}
                                >
                                  <RotateCw size={19} />
                                </button>
                                <button
                                  className="icon-btn"
                                  title="水平翻转"
                                  aria-label="翻转拼布"
                                  onClick={() => transform("flip")}
                                >
                                  <FlipHorizontal2 size={19} />
                                </button>
                              </>
                            )}
                            <button
                              className="primary"
                              disabled={!chosen || !isLegal(state, chosen)}
                              onClick={() => chosen && commit(chosen)}
                            >
                              {state.pending ? "确认缝上小补丁" : advanceSelected ? "确认前进赚纽扣" : "确认缝上拼布"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="player-stats">
                      <div>
                        <span>纽扣余额</span>
                        <strong>◎ {p.buttons}</strong>
                      </div>
                      <div>
                        <span>每次收入</span>
                        <strong>+ {p.income}</strong>
                      </div>
                      <div>
                        <span>当前得分</span>
                        <strong>{score(p)}</strong>
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="placement-bar" aria-live="polite">
                <div>
                  <strong>
                    {animation
                      ? `${name(animation.actor)}正在完成本步行动…`
                      : state.over
                      ? `${name(winner(state) ?? 0)}赢得了这场缝制`
                      : isReplay
                        ? "沿着时间，回看每一次选择"
                        : save.mode === "watch"
                          ? watchPaused ? "观战已暂停" : `${name(state.current)}正在选择下一步`
                        : !human
                          ? thinking
                            ? "小织正在挑选拼布…"
                            : "等待小织行动"
                          : advanceSelected
                            ? "前进赚纽扣 · 等待提交"
                          : state.pending
                            ? `轮到你缝小补丁！还有 ${state.pending} 块待缝上`
                            : piece === null
                              ? "从布料小铺挑选一块拼布"
                              : "旋转、翻转，然后选择落点"}
                  </strong>
                  <small>
                    {human && advanceSelected
                      ? "按棋盘下方的提交行动后，才会移动时间棋子并领取纽扣。"
                      : human && state.pending
                      ? "免费填 1 格，不消耗时间；点击棋盘空格，再按“确认缝上小补丁”。"
                      : human && piece !== null
                        ? chosen && !isLegal(state, chosen)
                          ? "这个位置重叠或越界，请换一个落点。"
                          : "鼠标格对应白色定位点；先看预览，点击锁定。"
                        : "拼得紧凑一点，每个空格会扣 2 分。"}
                  </small>
                </div>
                {state.over && (
                  <button
                    className="primary"
                    onClick={() => setModal("result")}
                  >
                    查看结算
                  </button>
                )}
              </div>
              {aiError && (
                <div className="notice" role="alert">
                  {aiError}。
                  <button
                    onClick={() => {
                      setAIError("");
                      setSave({ ...save, difficulty: "easy" });
                    }}
                  >
                    切换入门 AI 继续
                  </button>
                </div>
              )}
            </section>
            <aside className="side-column">
              <div className="track-heading"><h2>时间轨道</h2><span>后方玩家先行动</span></div>
              <TimeBoard state={trackState ?? state} name={name} pawnTimes={pawnTimes} />
            </aside>
              <section className="opponent panel rival-column">
                {(() => {
                  const i = save.mode === "local" ? 1 - (animation?.actor ?? state.current) : 1,
                    p = (boardState ?? state).players[i];
                  return (
                    <>
                      <div className="section-label">
                        <h2>
                          <i className={`dot ${i === 0 ? "teal" : "rose"}`} />
                          {name(i)}的作品
                        </h2>
                        <span>{p.board.filter((v) => v >= 0).length} / 81</span>
                      </div>
                      <div className="opponent-body">
                        <Board
                          key={i}
                          player={p}
                          state={boardState ?? state}
                          landing={animation?.actor === i && !phase?.landed && !phase?.flying ? animation.action : undefined}
                          highlight={(!animation || phase?.landed) && currentEntry?.actor === i ? currentEntry.action : undefined}
                          label={`${name(i)}的棋盘`}
                        />
                        <div className="opponent-stats">
                          <span>
                            纽扣 <b>◎ {p.buttons}</b>
                          </span>
                          <span>
                            收入 <b>+ {p.income}</b>
                          </span>
                          <span>
                            得分 <b>{score(p)}</b>
                          </span>
                          <small>
                            {thinking
                              ? "正在思考…"
                              : shownStats
                                ? `${shownStats.modelUsed ? "连通模型 · 每块最多 9 候选" : shownStats.modelEvaluations ? "模型排序超时 · 启发式回退" : shownStats.backend === "wasm" ? "C++" : "本地"} · ${shownStats.simulations ? `${shownStats.simulations} 次模拟` : "启发式"}`
                                : "慢慢来，好作品值得等待。"}
                          </small>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </section>
            </div>
              </TableMarket>
            </div>
            <aside className="activity-sidebar" aria-label="双方信息与行动日志">
          <section className="match-status" aria-label="双方对局信息">
            {state.players.map((p,i) => <div key={i} className={`status-player player-color-${i}`}>
              <div className="status-name"><strong>{name(i)}{p.bonus && <em className="bonus-badge">7 × 7 · +7</em>}</strong><span>{state.over ? "已结束" : state.current === i ? "行动中" : "等待"}</span></div>
              <div className="status-values">
                <span>剩余纽扣<b>◎ {p.buttons}</b></span>
                <span>每次收入<b>+{p.income}</b></span>
                <span>时间<b>{p.time} / 53</b></span>
                <span>未填空格<b>{p.board.filter(v => v < 0).length}</b></span>
                <span>得分<b>{score(p)}</b></span>
              </div>
            </div>)}
            <div className="session-tag">{isReplay ? "回放" : save.mode === "watch" ? `${DIFFICULTY[save.difficulty]} AI 对弈` : save.mode === "ai" ? `${DIFFICULTY[save.difficulty]} AI` : "双人对弈"}<span>第 {replayIndex ?? save.actions.length} 步</span></div>
          </section>

          <MoveHistory entries={entries} index={shownIndex} name={name} />
          {isReplay && (
            <div className="replay-bar">
              <button
                className="icon-btn"
                aria-label={playing ? "暂停回放" : "播放回放"}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? <Pause /> : <Play />}
              </button>
              <button className="text-btn" disabled={shownIndex === 0} onClick={() => seekReplay(shownIndex - 1)}>上一步</button>
              <button className="text-btn" disabled={shownIndex === save.actions.length} onClick={() => seekReplay(shownIndex + 1)}>下一步</button>
              <input
                aria-label="回放进度"
                type="range"
                min="0"
                max={save.actions.length}
                value={replayIndex ?? 0}
                onChange={(e) => {
                  setPlaying(false);
                  setReplayIndex(Number(e.target.value));
                }}
              />
              <span>
                {replayIndex} / {save.actions.length}
              </span>
              <button className="text-btn" onClick={exitReplay}>
                退出回放
              </button>
            </div>
          )}
          {isReplay && currentEntry && <DecisionReview entry={currentEntry} detail={save.analysis?.[shownIndex - 1]} name={name} isAI={save.mode === "watch" || (save.mode === "ai" && currentEntry.actor === 1)} />}
            </aside>
          </div>

          {animation && phase?.flying && <FlyingPatch entry={animation} progress={phase.flightProgress} />}

          {finalState?.over && <div className="panel final-record"><ScoreRecord state={finalState} name={name} /></div>}
          <footer className="game-footer">
            <span>每一块碎布，都有它的位置。</span>
            <button onClick={() => downloadSave(save)}>
              <Download size={15} />
              导出存档
            </button>
          </footer>
        </main>
      ) : null}
      {modal && (
        <Dialog
          title={
            modal === "rules"
              ? "缝制指南"
              : modal === "new"
                ? "开启一件新作品"
                : modal === "pause"
                  ? "休息一下，喝杯茶"
                  : modal === "practice"
                    ? "练习摆放 · 随时撤回"
                  : "最后一针，完成！"
          }
          className={modal === "practice" ? "practice-dialog" : undefined}
          onClose={() => setModal(null)}
        >
          {modal === "rules" ? (
            <Rules />
          ) : modal === "new" ? (
            <div className="settings">
              <label>
                对弈方式
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                >
                  <option value="ai">与小织对弈 · 本地 AI</option>
                  <option value="local">两位玩家 · 同屏轮流</option>
                  <option value="watch">观看 AI 对弈 · 双方自动落子</option>
                </select>
              </label>
              {mode !== "local" && (
                <label>
                  {mode === "watch" ? "双方 AI 难度" : "小织的手艺"}
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(e.target.value as Difficulty)
                    }
                  >
                    <option value="easy">入门</option>
                    <option value="normal">熟练</option>
                    <option value="hard">高级</option>
                  </select>
                </label>
              )}
              <p className="muted">
                {save
                  ? `开始新作品会替换当前存档。可先导出备份。${mode === "ai" ? "新局先后手随机决定。" : ""}`
                  : mode === "watch" ? "双方会自动对弈，可随时暂停、查看棋盘与回放。" : mode === "ai" ? "每人 5 枚纽扣，时间从零开始；先后手随机决定。" : "每人 5 枚纽扣，时间从零开始。玩家一先行动。"}
              </p>
              {save && (
                <button
                  className="secondary"
                  onClick={() => downloadSave(save)}
                >
                  <Download size={16} />
                  备份当前作品
                </button>
              )}
              <button className="primary large" onClick={begin}>
                {mode === "watch" ? "开始观战" : "开始缝制"} <ArrowRight size={18} />
              </button>
            </div>
          ) : modal === "practice" && state ? (
            <PracticeMode state={state} actor={state.current} onClose={() => setModal(null)} />
          ) : modal === "pause" ? (
            <div className="settings">
              <p className="muted">
                进度已自动保存。休息时，小织也会停下思考。
              </p>
              <button className="primary large" onClick={() => setModal(null)}>
                继续作品 <Play size={17} />
              </button>
              {save && (
                <>
                  <button
                    className="secondary"
                    onClick={() => downloadSave(save)}
                  >
                    <Download size={17} />
                    导出备份
                  </button>
                  <button className="secondary" onClick={startReplay}>
                    <Undo2 size={17} />
                    回看这局
                  </button>
                </>
              )}
              <button
                className="secondary"
                onClick={() => file.current?.click()}
              >
                <Upload size={17} />
                导入存档（替换当前进度）
              </button>
              <button
                className="text-btn"
                onClick={() => {
                  setModal(null);
                  setScreen("menu");
                }}
              >
                返回菜单
              </button>
            </div>
          ) : (
            state && (
              <div className="result">
                <div className="eyebrow">A QUILT TO REMEMBER</div>
                <ScoreRecord state={state} name={name} />
                <div className="menu-actions">
                  <button className="primary" onClick={() => { setMode("ai"); setDifficulty("hard"); setModal("new"); }}>
                    再缝一床
                  </button>
                  <button className="secondary" onClick={startReplay}>
                    回看作品
                  </button>
                </div>
              </div>
            )
          )}
        </Dialog>
      )}
    </div>
  );
}
