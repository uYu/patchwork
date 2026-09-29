import { useEffect, useMemo, useRef, useState } from "react";
import { PATCHES } from "../game/data.ts";
import type { State } from "../game/types.ts";
import { canFitPatch } from "../game/engine.ts";
import { Patch } from "./Patch.tsx";

export function FabricRoller({ state, human, watching = false, piece, onSelect }: {
  state: State; human: boolean; watching?: boolean; piece: number | null; onSelect: (id: number | null) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{x:number; left:number} | null>(null);
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selecting = useRef(onSelect);
  selecting.current = onSelect;
  const order = Array.from({length: state.circle.length}, (_, i) => state.circle[(state.token + i) % state.circle.length]);
  const key = order.join(",");
  const [index, setIndex] = useState(0);
  const [slot, setSlot] = useState(order.length * 3);
  const slots = Array.from({length:order.length * 7}, (_,j) => ({id:order[j % order.length],i:j % order.length}));
  const normalize = (i:number) => order.length ? (i % order.length + order.length) % order.length : 0;
  const position = (el:HTMLDivElement, i:number) => (i - 2) * el.clientWidth / 5;
  const player = state.players[state.current];
  const fits = useMemo(() => PATCHES.map(p => canFitPatch(player.board, p.id)), [player.board]);
  const enabled = human && !state.pending;
  const choose = (i: number) => {
    setIndex(i);
    const id = order[i];
    selecting.current(enabled && i < 3 && id !== undefined && PATCHES[id].cost <= player.buttons && fits[id] ? id : null);
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    if(timer.current) clearTimeout(timer.current);
    setSlot(order.length * 3);
    el.scrollLeft = position(el, order.length * 3);
    choose(0);
    return () => { if(timer.current) clearTimeout(timer.current); };
  }, [key, enabled]);
  useEffect(() => {
    if(piece === null) return;
    const i = order.indexOf(piece);
    const el = track.current;
    if(el && i >= 0 && i !== index) {
      setIndex(i);
      setSlot(order.length * 3 + i);
      el.scrollTo({left:position(el, order.length * 3 + i), behavior:"smooth"});
    }
  }, [piece]);
  useEffect(() => {
    const el = track.current;
    if(!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    };
    el.addEventListener("wheel", wheel, {passive:false});
    return () => el.removeEventListener("wheel",wheel);
  }, []);
  useEffect(() => {
    const el=track.current;
    if(!el) return;
    const observer=new ResizeObserver(() => {el.scrollLeft=position(el,order.length*3+index);setSlot(order.length*3+index);});
    observer.observe(el);
    return () => observer.disconnect();
  }, [key,index]);
  const move = (delta: number) => {
    const el = track.current;
    if(el && order.length) el.scrollTo({left:position(el, Math.round(el.scrollLeft/(el.clientWidth/5))+2+delta), behavior:"smooth"});
  };
  const focused = order[index];
  const reason = !enabled ? (watching ? "AI 对弈中" : state.pending ? "先缝上皮革补丁" : "等待你的回合") : focused !== undefined && !fits[focused] ? "放不下 · 所有旋转、翻转都没有合法落点" : index >= 3 ? "后续布料 · 本回合不能购买" : focused !== undefined && PATCHES[focused].cost > state.players[state.current].buttons ? "纽扣不足" : "居中拼布已选中 · 直接在棋盘定位";
  return <div className="fabric-roller">
    <div className="roller-window">
      <div className="roller-selection" aria-hidden="true" />
      <div ref={track} className="roller-track" tabIndex={0} role="region" aria-label="布料滚筒，左右滑动或使用方向键选择"
        onKeyDown={e => { if(e.key === "ArrowRight" || e.key === "ArrowLeft") {e.preventDefault();move(e.key === "ArrowRight" ? 1 : -1);} }}
        onPointerDown={e => {
          if(e.pointerType !== "mouse") return;
          moved.current=false;
          drag.current={x:e.clientX,left:e.currentTarget.scrollLeft};
        }}
        onPointerMove={e => {
          if(!drag.current) return;
          if(Math.abs(drag.current.x-e.clientX)>4) {
            moved.current=true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.style.scrollSnapType="none";
          }
          if(moved.current) e.currentTarget.scrollLeft=drag.current.left+drag.current.x-e.clientX;
        }}
        onPointerUp={e => {
          if(!drag.current) return;
          drag.current=null;
          e.currentTarget.style.scrollSnapType="";
          if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={e=>{drag.current=null;e.currentTarget.style.scrollSnapType="";}}
        onScroll={() => {
          if(timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const el=track.current;
            if(!el || !order.length || drag.current) return;
            const physical = Math.round(el.scrollLeft/(el.clientWidth/5))+2;
            const logical = normalize(physical);
            const centered = order.length*3+logical;
            setSlot(centered);
            if(physical !== centered) el.scrollLeft=position(el,centered);
            if(logical !== index) choose(logical);
          }, 120);
        }}>
        {slots.map(({id,i},j) => <button type="button" key={j} className={`roller-item ${j===slot ? "centered" : ""} ${i>=3 ? "future" : ""} ${i>=3 || PATCHES[id].cost > player.buttons || !fits[id] ? "unavailable" : ""}`} onClick={() => {
          if(moved.current) return;
          const el=track.current;
          setSlot(j);choose(i);
          if(el) el.scrollTo({left:position(el,j),behavior:"smooth"});
        }} aria-label={`第 ${i+1} 块，${id+1} 号拼布${i>=3 ? "，后续布料" : "，当前购买范围"}`}>
          <span>{i+1} · {!fits[id] ? "放不下" : i >= 3 ? "后续" : PATCHES[id].cost > player.buttons ? "纽扣不足" : "可选范围"}</span><Patch id={id} uniformScale/><small>◎ {PATCHES[id].cost} · ◷ {PATCHES[id].time} · +{PATCHES[id].income}</small>
        </button>)}
      </div>
    </div>
    <button className="roller-reset" disabled={!order.length} onClick={() => {
      moved.current=false;
      if(timer.current) clearTimeout(timer.current);
      choose(0);setSlot(order.length*3);
      track.current?.scrollTo({left:position(track.current,order.length*3),behavior:"smooth"});
    }}>回到开始</button>
    {focused !== undefined && <div className="roller-facts" aria-live="polite"><strong>{focused + 1} 号拼布</strong><span>成本 <b>{PATCHES[focused].cost} 纽扣</b> · 前进 <b>{PATCHES[focused].time} 步</b> · 收入 <b>+{PATCHES[focused].income}</b></span></div>}
    <div className="roller-navigation"><button aria-label="滚筒向前一块" disabled={!order.length} onClick={()=>move(-1)}>‹</button><span aria-live="polite">{reason}</span><button aria-label="滚筒向后一块" disabled={!order.length} onClick={()=>move(1)}>›</button></div>
  </div>;
}
