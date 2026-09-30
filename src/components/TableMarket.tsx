import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { State } from '../game/types.ts';
import { PATCHES } from '../game/data.ts';
import { canFitPatch } from '../game/engine.ts';
import { Patch } from './Patch.tsx';
import { marketRingPosition } from './marketRing.ts';

export function TableMarket({state,human,piece,flyingPiece,onSelect,children}: {
 state:State; human:boolean; piece:number|null; flyingPiece?:number|null; onSelect:(id:number)=>void; children:ReactNode;
}) {
 const [inspected,setInspected]=useState<number|null>(null);
 const [hovered,setHovered]=useState<{id:number;rank:number;left:number;top:number;above:boolean}|null>(null);
 const order=state.circle.map((_,i)=>state.circle[(state.token+i)%state.circle.length]);
 const player=state.players[state.current];
 const fits=useMemo(()=>PATCHES.map(p=>canFitPatch(player.board,p.id)),[player.board]);
 const focus=inspected!==null&&order.includes(inspected)?inspected:piece!==null&&order.includes(piece)?piece:order[0];
 const patch=PATCHES[focus];
 const position=(rank:number)=>marketRingPosition(rank,order.length);
 return <section className="table-market" aria-label="环绕三个棋盘的布料市场">
   <div className="table-market-info" aria-live="polite">
     <strong>布料环 · 顺时针 ↻</strong>
     <span>{patch?`${focus+1} 号拼布 · 成本 ${patch.cost} 纽扣 · 前进 ${patch.time} 步 · 收入 +${patch.income}`:'布料已售罄，可前进赚纽扣'}</span>
     <small>绿框前三块可购买 · 首尾相接</small>
   </div>
   <div className="table-ring-scroll" onScroll={()=>setHovered(null)}><div className="table-ring">
     <div className="table-ring-marker" style={position(0)}>♟<span>起点 →</span></div>
     {order.map((id,rank)=><button type="button" key={id} data-piece-id={id} style={position(rank+1)}
       className={`table-ring-patch ${rank<3?'reachable':''} ${piece===id?'selected':''} ${flyingPiece===id?'departing':''}`}
       aria-label={`环上第 ${rank+1} 块，${id+1} 号拼布，成本 ${PATCHES[id].cost} 纽扣，前进 ${PATCHES[id].time} 步，收入 +${PATCHES[id].income}${rank<3?'，购买范围内':'，后续布料'}`}
       aria-pressed={focus===id}
       onPointerEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setHovered({id,rank,left:Math.max(8,Math.min(window.innerWidth-250,r.left+r.width/2-120)),top:r.top>=250?r.top-8:r.bottom+8,above:r.top>=250});}}
       onPointerLeave={()=>setHovered(null)}
       onFocus={e=>{const r=e.currentTarget.getBoundingClientRect();setHovered({id,rank,left:Math.max(8,Math.min(window.innerWidth-250,r.left+r.width/2-120)),top:r.top>=250?r.top-8:r.bottom+8,above:r.top>=250});}}
       onBlur={()=>setHovered(null)}
       onClick={()=>{setInspected(id);if(human&&!state.pending&&rank<3&&fits[id]&&PATCHES[id].cost<=player.buttons)onSelect(id);}}>
       <span>{rank+1} · {rank<3?(!fits[id]?'放不下':PATCHES[id].cost>player.buttons?'不足':'可选'):'→'}</span>
       <Patch id={id} uniformScale />
       <small>◎{PATCHES[id].cost} · ◷{PATCHES[id].time} · +{PATCHES[id].income}</small>
     </button>)}
     <div className="table-ring-center">{children}</div>
   </div></div>
   {hovered && <div className={`table-patch-tooltip ${hovered.above?'above':''}`} style={{left:hovered.left,top:hovered.top}} role="status">
     <strong>{hovered.id+1} 号拼布 <small>环上第 {hovered.rank+1} 块</small></strong>
     <Patch id={hovered.id} uniformScale />
     <span>成本 <b>{PATCHES[hovered.id].cost} 纽扣</b></span>
     <span>前进 <b>{PATCHES[hovered.id].time} 步</b> · 收入 <b>+{PATCHES[hovered.id].income}</b></span>
     <small>{PATCHES[hovered.id].cells.length} 格 · {hovered.rank<3?(fits[hovered.id]&&PATCHES[hovered.id].cost<=player.buttons?'当前可购买':!fits[hovered.id]?'当前棋盘放不下':'纽扣不足'):'后续布料'}</small>
   </div>}
 </section>;
}
