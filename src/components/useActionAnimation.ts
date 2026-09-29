import { useEffect, useRef, useState } from 'react';
import { actionAnimationFrame } from '../game/animation.ts';
import type { HistoryEntry } from '../game/history.ts';

export function useActionAnimation(entry: HistoryEntry | null, running: boolean, onComplete: () => void) {
 const callback=useRef(onComplete); callback.current=onComplete;
 const clock=useRef<{entry:HistoryEntry|null;elapsed:number}>({entry:null,elapsed:0});
 const [frame,setFrame]=useState<{entry:HistoryEntry;elapsed:number}|null>(null);
 const [reduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{
   if(clock.current.entry!==entry)clock.current={entry,elapsed:0};
   if(!entry||!running)return;
   const start=performance.now()-clock.current.elapsed;
   let id=0;
   const tick=(now:number)=>{
     clock.current.elapsed=now-start;
     if(actionAnimationFrame(entry,clock.current.elapsed,reduced).done){callback.current();return;}
     setFrame({entry,elapsed:clock.current.elapsed});
     id=requestAnimationFrame(tick);
   };
   id=requestAnimationFrame(tick);
   return ()=>cancelAnimationFrame(id);
 },[entry,running,reduced]);
 return entry?actionAnimationFrame(entry,frame?.entry===entry?frame.elapsed:0,reduced):null;
}
